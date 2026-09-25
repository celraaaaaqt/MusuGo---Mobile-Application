import { pb } from '../lib/pb.js';

// Base URL of the Express payment server. Trailing slashes are stripped so
// the path never becomes "//api/...". Set VITE_PAYMENT_SERVER_URL before building.
const PAYMENT_SERVER_URL = (
  import.meta.env.VITE_PAYMENT_SERVER_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const gcashQrModal = document.getElementById("gcash-qr-modal");
const gcashQrImage = document.getElementById("gcash-qr-image");
const gcashQrOrderNumber = document.getElementById("gcash-qr-order-number");
const gcashQrTotal = document.getElementById("gcash-qr-total");
const gcashQrTimer = document.getElementById("gcash-qr-timer");
const gcashQrStatus = document.getElementById("gcash-qr-status");
const gcashQrCancel = document.getElementById("gcash-qr-cancel");

let qrCountdownInterval = null;
let qrOrderUnsubscribe = null;
let currentGcashOrder = null; // { orderId, paymentId, items }

function hideQrModal() {
  gcashQrModal.classList.add("hidden");
  gcashQrModal.classList.remove("flex");
}

function stopQrWaiting() {
  if (qrCountdownInterval) {
    clearInterval(qrCountdownInterval);
    qrCountdownInterval = null;
  }
  if (qrOrderUnsubscribe) {
    qrOrderUnsubscribe();
    qrOrderUnsubscribe = null;
  }
}

// Asks the payment server to create the PayMongo Payment Intent and QR Ph code.
// Throws on failure, including non-JSON responses.
export async function requestGcashQr({ amount, orderId, orderNumber }) {
  const res = await fetch(`${PAYMENT_SERVER_URL}/api/create-qrph-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, orderId, orderNumber }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON: the server returned an HTML/text error page
  }

  if (!res.ok) {
    throw new Error(data.error || `Failed to create QR code (HTTP ${res.status})`);
  }

  return data; // { paymentIntentId, qrImageUrl, expiresAt }
}

// Restores stock and marks the order/payment "Cancelled". Runs through the
// payment server (not directly against PocketBase) since only superusers
// are allowed to update orders/payment/products, and the browser is anonymous.
export async function releaseOrder({ orderId, paymentId, items }) {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/api/cancel-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, paymentId, items }),
    });
    if (!res.ok) {
      console.error("cancel-order returned", res.status);
    }
  } catch (err) {
    console.error("Failed to cancel order:", err);
  }
}

// Shows the QR modal, starts the expiry countdown, and subscribes to this
// order's PocketBase record so the moment the webhook marks it "Paid" we
// can call back into checkout.js to show the success modal.
export function showGcashQrModal(order, qrData, paymentId, items, { onPaid } = {}) {
  stopQrWaiting(); // just in case one was already running

  currentGcashOrder = { orderId: order.id, paymentId, items };

  gcashQrOrderNumber.textContent = `#${order.order_number}`;
  gcashQrTotal.textContent = `₱${Number(order.total).toFixed(2)}`;
  gcashQrImage.src = qrData.qrImageUrl;
  gcashQrStatus.textContent = "Waiting for payment…";

  gcashQrModal.classList.remove("hidden");
  gcashQrModal.classList.add("flex");

  function tick() {
    const msLeft = qrData.expiresAt - Date.now();

    if (msLeft <= 0) {
      stopQrWaiting();
      hideQrModal();
      cancelGcashOrder();
      Swal.fire({
        icon: "info",
        title: "QR code expired",
        text: "Your order was cancelled. Please place your order again.",
      });
      return;
    }

    const totalSeconds = Math.floor(msLeft / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    gcashQrTimer.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  tick();
  qrCountdownInterval = setInterval(tick, 1000);

  pb.collection('orders').subscribe(order.id, (e) => {
    if (e.record.payment_status === "Paid") {
      currentGcashOrder = null;
      stopQrWaiting();

      gcashQrModal.classList.add("hidden");
      gcashQrModal.classList.remove("flex");

      onPaid?.(order);
    }
  }).then((unsubscribe) => {
    qrOrderUnsubscribe = unsubscribe;
  });
}

// Cancels the current GCash order via the payment server — used both when
// the customer backs out of the QR modal and when the QR expires unpaid.
async function cancelGcashOrder() {
  if (!currentGcashOrder) return;

  const order = currentGcashOrder;
  currentGcashOrder = null;
  await releaseOrder(order);
}

gcashQrCancel.addEventListener("click", () => {
  stopQrWaiting();
  hideQrModal();
  cancelGcashOrder();
});