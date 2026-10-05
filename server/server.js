import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import PocketBase from "pocketbase";

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
  SITE_URL,
} = process.env;

// PayMongo needs "Basic base64(secret_key:)" auth
const paymongoAuth =
  "Basic " + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");

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
    .getFirstListItem(pb.filter("orders = {:id}", { id: orderId }))
    .catch(() => null);

  // Same idea for payment: separate collection with an "order" relation.
  const payment = await pb
    .collection("payment")
    .getFirstListItem(pb.filter("order = {:id}", { id: orderId }))
    .catch(() => null);

  const items = (order.expand?.cart_items || []).map((ci) => ({
    name: ci.expand?.product?.product_name || "Item",
    quantity: ci.quantity,
    price: ci.price,
  }));

  return { order, customerInfo, items, payment };
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


// 1b) QR Ph (GCash scan-to-pay) in one call: create the Payment Intent,
//     create a qrph Payment Method, and attach them — all server-side,
//     since qrph billing details (name/email/phone) aren't sensitive
//     card data and don't need to touch the client's public key.
//     Returns the base64 QR image the frontend renders directly.
app.post("/api/create-qrph-intent", express.json(), async (req, res) => {
  const { orderId, billingName, billingEmail, billingPhone } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const pbAdmin = await getSuperuserPb();
    const order = await pbAdmin.collection("orders").getOne(orderId);
    if (order.payment_status !== "Pending") {
      return res.status(400).json({ error: "Order is not awaiting payment" });
    }
    const amount = order.total;
    const orderNumber = order.order_number;

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
            const { order, customerInfo, items, payment } = await getReceiptData(orderId);
            if (customerInfo?.customer_gmail) {
              await sendReceiptEmail({
                to: customerInfo.customer_gmail,
                order,
                customerName: customerInfo.customer_name,
                items,
                payment,
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
  const { orderId, paymentId } = req.body;

  if (!orderId || !paymentId) {
    return res.status(400).json({ error: "orderId and paymentId are required" });
  }

  try {
    const pb = await getSuperuserPb();

    const order = await pb.collection("orders").getOne(orderId, {
      expand: "cart_items",
    });

    if (order.payment_status === "Paid") {
      console.warn(`cancel-order skipped: order ${orderId} is already Paid`);
      return res.json({ ok: true, skipped: true, reason: "already_paid" });
    }
    if (order.payment_status === "Cancelled") {
      return res.json({ ok: true, skipped: true, reason: "already_cancelled" });
    }

    // Claim the cancellation FIRST so a second call sees "Cancelled"
    // and skips, instead of both calls restoring stock.
    await pb.collection("orders").update(orderId, { payment_status: "Cancelled" });
    await pb.collection("payment").update(paymentId, { status: "Cancelled" });

    // Build the restore list from what was actually ordered, not from the browser.
    const items = (order.expand?.cart_items || []).map((ci) => ({
      id: ci.product,
      quantity: ci.quantity,
    }));

    const failed = [];
    for (const item of items) {
      try {
        await pb.collection("products").update(item.id, { "stocks+": item.quantity });
      } catch (err) {
        failed.push(item.id);
        console.error("Failed to restore stock for", item.id, err);
      }
    }

    if (failed.length) {
      console.error(`RECONCILE NEEDED: order ${orderId} cancelled, stock not restored for`, failed);
    }

    res.json({ ok: true, restoreFailed: failed });
  } catch (err) {
    console.error("cancel-order failed:", err);
    res.status(500).json({
      error: "Failed to cancel order",
      detail: err?.data ? JSON.stringify(err.data) : (err?.message || String(err)),
    });
  }
});


// Marks a Cash order as paid + its payment record Complete, in one call.
// Runs server-side with superuser auth since orders/payment are locked to
// superuser-only updates (anonymous kiosk clients can't do this directly).
app.post("/api/mark-cash-paid", express.json(), async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const pb = new PocketBase(POCKETBASE_URL);
    await pb.collection("_superusers").authWithPassword(
      PB_SUPERUSER_EMAIL,
      PB_SUPERUSER_PASSWORD
    );

    const order = await pb.collection("orders").getOne(orderId);

    if (order.payment_status === "Paid") {
      return res.json({ ok: true, skipped: true, reason: "already_paid" });
    }

    const paymentRecord = await pb
      .collection("payment")
      .getFirstListItem(`order="${orderId}"`);

    if (paymentRecord.payment_method !== "Cash") {
      return res.status(400).json({
        error: "This endpoint only handles Cash orders. Use the GCash flow for that payment method.",
      });
    }

    await pb.collection("orders").update(orderId, { payment_status: "Paid" });
    await pb.collection("payment").update(paymentRecord.id, { status: "Complete" });

    res.json({ ok: true });
  } catch (err) {
    console.error("mark-cash-paid failed:", err);
    res.status(500).json({
      error: "Failed to mark order as paid",
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


const fail = (status, message) =>
  Object.assign(new Error(message), { status, userFacing: true });

app.post("/api/place-order", express.json(), async (req, res) => {
  const { items, paymentMethod, customer } = req.body || {};
  const wanted = new Map(); // merge duplicate product lines
  try {
    // ---- validate input ----
    if (!Array.isArray(items) || items.length === 0) throw fail(400, "Your cart is empty.");
    if (!["Cash", "via E-Wallet"].includes(paymentMethod)) throw fail(400, "Invalid payment method.");
    if (!customer?.name || !/^\S+@\S+\.\S+$/.test(customer.email || "")) {
      throw fail(400, "Please provide a valid name and email.");
    }

  
    for (const it of items) {
      const qty = Number(it.quantity);
      if (typeof it.id !== "string" || !Number.isInteger(qty) || qty < 1) {
        throw fail(400, "Invalid item in cart.");
      }
      wanted.set(it.id, (wanted.get(it.id) || 0) + qty);
    }
    const totalQty = [...wanted.values()].reduce((a, b) => a + b, 0);
    if (totalQty > 10) throw fail(400, "You can order up to 10 items per order.");
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  let pb;
  const reserved = [];   // stock we deducted, so we can undo it
  let orderId = null;

  try {
   pb = await getSuperuserPb();
    // ---- reserve stock using REAL prices from the database ----
    const lines = [];
    for (const [id, qty] of wanted) {
      const product = await pb.collection("products").getOne(id).catch(() => null);
      if (!product || product.is_active === false) {
        throw fail(409, "An item in your cart is no longer available.");
      }
      if (product.stocks < qty) {
        throw fail(409, `Sorry, "${product.product_name}" doesn't have enough stock left.`);
      }
     try {
  await pb.collection("products").update(id, { "stocks-": qty });
} catch {
  throw fail(409, `Sorry, "${product.product_name}" doesn't have enough stock left.`);
}
reserved.push({ id, quantity: qty });
      lines.push({ product, qty });
    }

    // ---- create records ----
    const cartItemIds = [];
    let total = 0;
    for (const { product, qty } of lines) {
      const subtotal = product.price * qty;
      total += subtotal;
      const ci = await pb.collection("cart_items").create({
        product: product.id,
        quantity: qty,
        price: product.price,
        subtotal,
      });
      cartItemIds.push(ci.id);
    }

    const now = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const orderNumber =
      `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-` +
      `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;

    const order = await pb.collection("orders").create({
      order_number: orderNumber,
      cart_items: cartItemIds,
      total,
      payment_status: "Pending",
    });
    orderId = order.id;

    await pb.collection("customer_info").create({
      orders: order.id,
      customer_name: customer.name,
      customer_gmail: customer.email,
      customer_contact: customer.contact,
    });

    const payment = await pb.collection("payment").create({
      order: order.id,
      amount: total,
      payment_method: paymentMethod,
      status: "Pending",
    });

    res.json({
      order: { id: order.id, order_number: order.order_number, total },
      paymentId: payment.id,
    });
    } catch (err) {
    console.error("place-order failed:", err);

    if (pb) {
      for (const r of reserved) {
        await pb.collection("products")
          .update(r.id, { "stocks+": r.quantity })
          .catch((e) => console.error("Failed to restore stock for", r.id, e));
      }
      if (orderId) {
        await pb.collection("orders")
          .update(orderId, { payment_status: "Cancelled" })
          .catch(() => {});
      }
    }

    if (err.userFacing) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: "Something went wrong while placing your order." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Payment server running on port ${PORT}`);
});

//customer receipt
app.post("/api/send-receipt", express.json(), async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const { order, customerInfo, items, payment } = await getReceiptData(orderId);

    if (!customerInfo?.customer_gmail) {
      return res.status(404).json({ error: "No customer info found for this order" });
    }

    await sendReceiptEmail({
      to: customerInfo.customer_gmail,
      order,
      customerName: customerInfo.customer_name,
      items,
      payment,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to send receipt email:", err);
    res.status(500).json({ error: "Failed to send receipt email" });
  }
});

app.post("/api/submit-rating", express.json(), async (req, res) => {
  const { orderId, rating, feedback } = req.body || {};
  const stars = Number(rating);
  if (typeof orderId !== "string" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: "Invalid rating." });
  }

  try {
    const pb = await getSuperuserPb();
    const order = await pb.collection("orders").getOne(orderId);

  const info = await pb
  .collection("customer_info")
  .getFirstListItem(pb.filter("orders = {:id}", { id: order.id }))
  .catch((err) => {
    console.error("customer_info lookup failed for order", order.id, ":", err?.data || err?.message || err);
    return null;
  });

console.log("customer_info lookup result for order", order.id, ":", info);

    const existing = await pb
      .collection("customer_ratings")
      .getFirstListItem(pb.filter("customer_order = {:id}", { id: order.id }))
      .catch(() => null);
    if (existing) return res.status(409).json({ error: "This order was already rated." });

    await pb.collection("customer_ratings").create({
      customer_order: order.id,
      customer_name: info?.customer_name || "Unknown", // store the actual name text
      rating: String(stars),
      feedback: String(feedback ?? "").slice(0, 500),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("submit-rating failed:", err);
    res.status(500).json({ error: "Could not save your rating." });
  }
}); 

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

async function sendReceiptEmail({ to, order, customerName, items, payment }) {
  const statusUrl = `${SITE_URL}/order-status.html?id=${order.id}`;
  const qrBuffer = await QRCode.toBuffer(statusUrl, { width: 200, margin: 1 });
  const qrBase64 = qrBuffer.toString("base64");

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:4px 0;">${item.quantity} × ${escapeHtml(item.name)}</td>
          <td style="padding:4px 0; text-align:right;">₱${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  // Amount paid / change rows.
  //  - E-wallet (QR): the exact total was paid, so change is 0.
  //  - Cash: staff enter cash_received/change later in the staff app, and the
  //    cash receipt email goes out at order time, so these rows only appear
  //    when staff already filled them in (otherwise they're left out).
  const total = Number(order.total) || 0;
  const isCash = payment?.payment_method === "Cash";
  const amountPaid = !payment
    ? 0
    : isCash
      ? Number(payment.cash_received) || 0
      : Number(payment.amount) || total;
  const change = isCash
    ? Number(payment?.change) || Math.max(0, amountPaid - total)
    : 0;

  const paymentHtml = amountPaid > 0
    ? `
      <table style="width:100%; margin:0 0 12px;">
        <tr>
          <td style="padding:2px 0; color:#555;">Amount paid</td>
          <td style="padding:2px 0; text-align:right;">₱${amountPaid.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:2px 0; color:#555;">Change</td>
          <td style="padding:2px 0; text-align:right;">₱${change.toFixed(2)}</td>
        </tr>
      </table>
    `
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 400px; margin: auto;">
      <h2 style="color:#7a1f2b;">MusuGo Receipt</h2>
      <p>Hi ${escapeHtml(customerName)}, thank you for ordering @MusuGo!</p>
      <p><strong>Order #${order.order_number}</strong></p>
      <table style="width:100%; border-top:1px solid #eee; border-bottom:1px solid #eee; margin:12px 0;">
        ${itemsHtml}  
      </table>
      <p style="font-weight:bold; font-size:18px;">Total: ₱${Number(order.total).toFixed(2)}</p>
      ${paymentHtml}
      <p>A QR code for checking your order status is attached to this email.</p>
      <p style="font-size:12px; color:#888;">
        Or open this link: <a href="${statusUrl}">${statusUrl}</a>
      </p>
    </div>
  `;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "MusuGo", email: GMAIL_USER },
      to: [{ email: to, name: customerName }],
      subject: `Your MusuGo Receipt - Order #${order.order_number}`,
      htmlContent: html,
      attachment: [
        {
          content: qrBase64,
          name: "qrcode_receipt.png",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo send failed: ${response.status} ${errBody}`);
  }
}