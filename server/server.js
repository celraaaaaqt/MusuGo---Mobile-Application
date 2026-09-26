import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import PocketBase from "pocketbase";

import nodemailer from "nodemailer";
import QRCode from "qrcode";

const app = express();
app.use(cors());

const {
  PAYMONGO_SECRET_KEY,
  PAYMONGO_WEBHOOK_SECRET,
  POCKETBASE_URL,
  PB_SUPERUSER_EMAIL,
  PB_SUPERUSER_PASSWORD,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  SITE_URL,
} = process.env;

// PayMongo needs "Basic base64(secret_key:)" auth
const paymongoAuth =
  "Basic " + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");

const mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// Reused by the webhook and the /api/send-receipt endpoint — both need an
// authenticated superuser client to read orders/customer_info.
async function getSuperuserPb() {
  const pb = new PocketBase(POCKETBASE_URL);
  await pb.collection("_superusers").authWithPassword(
    PB_SUPERUSER_EMAIL,
    PB_SUPERUSER_PASSWORD
  );
  return pb;
}

async function getReceiptData(orderId) {
  const pb = await getSuperuserPb();

  const order = await pb.collection("orders").getOne(orderId, {
    expand: "cart_items,cart_items.product",
  });

  // customer_info isn't embedded on the order — it's a separate collection
  // with an "orders" relation pointing back, so we look it up separately.
  const customerInfo = await pb
    .collection("customer_info")
    .getFirstListItem(`orders = "${orderId}"`)
    .catch(() => null);

  const items = (order.expand?.cart_items || []).map((ci) => ({
    name: ci.expand?.product?.product_name || "Item",
    quantity: ci.quantity,
    price: ci.price,
  }));

  return { order, customerInfo, items };
}

// PayMongo signs webhooks differently per mode (test vs live) — figure out
// which one we're in from the secret key prefix so we compare against the
// right half of the Paymongo-Signature header.
const PAYMONGO_MODE = PAYMONGO_SECRET_KEY?.startsWith("sk_live_")
  ? "live"
  : "test";

async function paymongoRequest(path, body) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: paymongoAuth,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// 1) Frontend calls this right after the order/payment records are
//    created with status "Pending" — creates a PayMongo Payment Intent
//    and hands back the client_key the frontend needs next.
app.post("/api/create-intent", express.json(), async (req, res) => {
  const { amount, orderId, orderNumber } = req.body;

  try {
    const response = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: paymongoAuth,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // PayMongo uses centavos
            currency: "PHP",
            payment_method_allowed: ["qrph"],
            description: `Order #${orderNumber}`,
            metadata: { order_id: orderId }, // lets the webhook find the order later
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    res.json({
      paymentIntentId: data.data.id,
      clientKey: data.data.attributes.client_key,
    });
  } catch (err) {
    console.error("create-intent failed:", err);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
});

// 1b) QR Ph (GCash scan-to-pay) in one call: create the Payment Intent,
//     create a qrph Payment Method, and attach them — all server-side,
//     since qrph billing details (name/email/phone) aren't sensitive
//     card data and don't need to touch the client's public key.
//     Returns the base64 QR image the frontend renders directly.
app.post("/api/create-qrph-intent", express.json(), async (req, res) => {
  const {
    amount,
    orderId,
    orderNumber,
    billingName,
    billingEmail,
    billingPhone,
  } = req.body;

  if (!amount || !orderId) {
    return res.status(400).json({ error: "amount and orderId are required" });
  }

  try {
    // Step 1: create the Payment Intent
    const intent = await paymongoRequest("payment_intents", {
      data: {
        attributes: {
          amount: Math.round(amount * 100),
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          description: `Order #${orderNumber}`,
          metadata: { order_id: orderId },
        },
      },
    });
    if (!intent.ok) return res.status(intent.status).json(intent.data);
    const intentId = intent.data.data.id;

     // Step 2: create the qrph Payment Method
    const method = await paymongoRequest("payment_methods", {
      data: {
        attributes: {
          type: "qrph",
          billing: {
            name: billingName || "Customer",
            email: billingEmail || "customer@musugo.local",
            ...(billingPhone ? { phone: billingPhone } : {}),
          },
        },
      },
    });
    if (!method.ok) return res.status(method.status).json(method.data);
    const methodId = method.data.data.id;

    // Step 3: attach — this is what actually generates the QR code
    const attach = await paymongoRequest(
      `payment_intents/${intentId}/attach`,
      { data: { attributes: { payment_method: methodId } } }
    );
    if (!attach.ok) return res.status(attach.status).json(attach.data);

    const code = attach.data.data.attributes.next_action?.code;
    if (!code?.image_url) {
      console.error("No QR code in attach response:", attach.data);
      return res.status(502).json({ error: "PayMongo did not return a QR code" });
    }

   res.json({
  paymentIntentId: intentId,
  qrImageUrl: code.image_url,
  expiresAt: Number.isFinite(Number(code.expires_at) * 1000) && Number(code.expires_at) * 1000 > Date.now()
    ? Number(code.expires_at) * 1000
    : Date.now() + 30 * 60 * 1000,
});
  } catch (err) {
    console.error("create-qrph-intent failed:", err);
    res.status(500).json({ error: "Failed to create QR Ph payment" });
  }
});

// Verifies the Paymongo-Signature header (HMAC-SHA256 over "timestamp.rawBody")
// against the te (test mode) or li (live mode) half, per PayMongo's docs:
// https://developers.paymongo.com/docs/securing-webhook
function verifyPaymongoSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !PAYMONGO_WEBHOOK_SECRET) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, value];
    })
  );

  const { t, te, li } = parts;
  const candidate = PAYMONGO_MODE === "live" ? li : te;
  if (!t || !candidate) return false;

  // reject stale/replayed webhook calls (more than 5 minutes old)
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto
    .createHmac("sha256", PAYMONGO_WEBHOOK_SECRET)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
  } catch {
    // length mismatch etc. — treat as not verified
    return false;
  }
}

// 2) PayMongo calls this when the customer actually pays.
//    Needs the raw body to verify the signature, so no express.json() here.
app.post(
  "/api/paymongo-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signatureHeader = req.headers["paymongo-signature"];
    const rawBody = req.body.toString();

    if (!verifyPaymongoSignature(rawBody, signatureHeader)) {
      console.warn("Rejected webhook: invalid or missing signature");
      return res.sendStatus(401);
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type;

      if (eventType === "payment.paid") {
      try {
        const payment = event.data.attributes.data;
        let orderId = payment.attributes.metadata?.order_id;
        console.log("payment.paid received:", {
          paymentId: payment.id,
          paymentIntentId: payment.attributes.payment_intent_id,
          metadataOnPayment: payment.attributes.metadata,
        });

        // Fall back to fetching the payment intent, which holds our metadata
        if (!orderId && payment.attributes.payment_intent_id) {
          const intentRes = await fetch(
            `https://api.paymongo.com/v1/payment_intents/${payment.attributes.payment_intent_id}`,
            { headers: { Authorization: paymongoAuth } }
          );
          const intentJson = await intentRes.json();
          if (!intentRes.ok) {
            console.error(
              "Failed to fetch payment intent for metadata fallback:",
              intentRes.status,
              JSON.stringify(intentJson)
            );
          } else {
            console.log(
              "Fetched intent metadata:",
              intentJson?.data?.attributes?.metadata
            );
          }
          orderId = intentJson?.data?.attributes?.metadata?.order_id;
        }

        if (orderId) {
          const pb = new PocketBase(POCKETBASE_URL);
          await pb.collection("_superusers").authWithPassword(
            PB_SUPERUSER_EMAIL,
            PB_SUPERUSER_PASSWORD
          );

          const currentOrder = await pb.collection("orders").getOne(orderId);
          if (currentOrder.payment_status === "Cancelled") {
            console.warn(
              `RECONCILE NEEDED: order ${orderId} was already Cancelled ` +
              `(stock restored) but payment.paid arrived after the fact. ` +
              `Marking Paid anyway — check stock manually.`
            );
          }


          //for completed order and will send a qr on customer gmail account.
                    await pb.collection("orders").update(orderId, { payment_status: "Paid" });

          try {
            const { order, customerInfo, items } = await getReceiptData(orderId);
            if (customerInfo?.customer_gmail) {
              await sendReceiptEmail({
                to: customerInfo.customer_gmail,
                order,
                customerName: customerInfo.customer_name,
                items,
              });
            } else {
              console.warn(`No customer_info found for order ${orderId} — skipping email`);
            }
          } catch (emailErr) {
            console.error("Receipt email failed (GCash):", emailErr);
          }

          const paymentRecord = await pb
            .collection("payment")
            .getFirstListItem(`order="${orderId}"`);
          await pb.collection("payment").update(paymentRecord.id, { status: "Complete" });
        } else {
          console.warn("payment.paid webhook had no order_id metadata");
        }
      } catch (err) {
        console.error("Failed to update PocketBase after payment:", err);
      }
    }

    res.sendStatus(200); // acknowledge receipt regardless, per PayMongo's retry rules
  }
);

// Cancels an unpaid GCash order: restores stock and marks order/payment cancelled.
// Runs server-side so it can use superuser auth.
app.post("/api/cancel-order", express.json(), async (req, res) => {
  const { orderId, paymentId, items } = req.body;

  if (!orderId || !paymentId || !Array.isArray(items)) {
    return res.status(400).json({ error: "orderId, paymentId, and items are required" });
  }

  try {
    const pb = new PocketBase(POCKETBASE_URL);
    await pb.collection("_superusers").authWithPassword(
      PB_SUPERUSER_EMAIL,
      PB_SUPERUSER_PASSWORD
    );

    // Guard against the client-side QR expiry timer racing the webhook:
    // if the webhook already marked this order Paid, never cancel it or
    // restore its stock, even if this call arrives after the timer fires.
    const currentOrder = await pb.collection("orders").getOne(orderId);
    if (currentOrder.payment_status === "Paid") {
      console.warn(`cancel-order skipped: order ${orderId} is already Paid`);
      return res.json({ ok: true, skipped: true, reason: "already_paid" });
    }

    for (const item of items) {
      try {
        await pb.collection("products").update(item.id, { "stocks+": item.quantity });
      } catch (err) {
        console.error("Failed to restore stock for", item.id, err);
      }
    }

    await pb.collection("orders").update(orderId, { payment_status: "Cancelled" });
    await pb.collection("payment").update(paymentId, { status: "Cancelled" });

    res.json({ ok: true });
    } catch (err) {
    console.error("cancel-order failed:", err);
    res.status(500).json({
      error: "Failed to cancel order",
      detail: err?.data ? JSON.stringify(err.data) : (err?.message || String(err)),
    });
  }
});

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "MusuGo Payment Server",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Payment server running on port ${PORT}`);
});

//customer receipt
app.post("/api/send-receipt", async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const { order, customerInfo, items } = await getReceiptData(orderId);

    if (!customerInfo?.customer_gmail) {
      return res.status(404).json({ error: "No customer info found for this order" });
    }

    await sendReceiptEmail({
      to: customerInfo.customer_gmail,
      order,
      customerName: customerInfo.customer_name,
      items,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to send receipt email:", err);
    res.status(500).json({ error: "Failed to send receipt email" });
  }
});


async function sendReceiptEmail({ to, order, customerName, items }) {
  const statusUrl = `${SITE_URL}/order-status.html?id=${order.id}`;

  // Generate the QR as an image buffer (not a data URL) — email clients
  // handle a real attached image far more reliably than inline base64.
  const qrBuffer = await QRCode.toBuffer(statusUrl, { width: 200, margin: 1 });

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:4px 0;">${item.quantity} × ${item.name}</td>
          <td style="padding:4px 0; text-align:right;">₱${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 400px; margin: auto;">
      <h2 style="color:#7a1f2b;">MusuGo Receipt</h2>
      <p>Hi ${customerName}, thanks for your order!</p>

      <p><strong>Order #${order.order_number}</strong></p>

      <table style="width:100%; border-top:1px solid #eee; border-bottom:1px solid #eee; margin:12px 0;">
        ${itemsHtml}
      </table>

      <p style="font-weight:bold; font-size:18px;">Total: ₱${Number(order.total).toFixed(2)}</p>

      <p>Scan the QR code below anytime to check your order status:</p>
      <img src="cid:receipt-qr" alt="Order status QR code" width="150" height="150" />

      <p style="font-size:12px; color:#888;">
        Or open this link: <a href="${statusUrl}">${statusUrl}</a>
      </p>
    </div>
  `;

  await mailTransporter.sendMail({
    from: `"MusuGo" <${GMAIL_USER}>`,
    to,
    subject: `Your MusuGo Receipt - Order #${order.order_number}`,
    html,
    attachments: [
      {
        filename: "qrcode.png",
        content: qrBuffer,
        cid: "receipt-qr", // referenced by src="cid:receipt-qr" above
      },
    ],
  });
}