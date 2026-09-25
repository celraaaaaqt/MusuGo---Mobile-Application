import { pb } from '../lib/pb.js';

// Base URL of the Express payment server (server/server.js). Set
// VITE_PAYMENT_SERVER_URL in your .env for production; defaults to the
// local dev server.
const PAYMENT_SERVER_URL =
  import.meta.env.VITE_PAYMENT_SERVER_URL || "http://localhost:3000";

const gcashQrModal = document.getElementById("gcash-qr-modal");
const gcashQrImage = document.getElementById("gcash-qr-image");
const gcashQrOrderNumber = document.getElementById("gcash-qr-order-number");
const gcashQrTotal = document.getElementById("gcash-qr-total");
const gcashQrTimer = document.getElementById("gcash-qr-timer");
const gcashQrStatus = document.getElementById("gcash-qr-status");
const gcashQrCancel = document.getElementById("gcash-qr-cancel");

let qrCountdownInterval = null;
let qrOrderUnsubscribe = null;
let currentGcashOrder = null; // { orderId, paymentId, items } for cancel/expiry cleanup

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

// Asks server.js to create the PayMongo Payment Intent + Payment Method
// and attach them, returning the real QR Ph code. Throws on failure.
export async function requestGcashQr({ amount, orderId, orderNumber }) {
  const res = await fetch(`${PAYMENT_SERVER_URL}/api/create-qrph-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, orderId, orderNumber }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to create QR code");
  }

  return data; // { paymentIntentId, qrImageUrl, expiresAt }
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
      gcashQrTimer.textContent = "Expired";
      gcashQrStatus.textContent = "This QR code has expired. Restoring your order…";
      clearInterval(qrCountdownInterval);
      qrCountdownInterval = null;
      cancelGcashOrder();
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

// Restores stock and marks the order/payment "Cancelled" — used both when
// the customer backs out of the QR modal and when the QR expires unpaid.
async function cancelGcashOrder() {
  if (!currentGcashOrder) return;

  const { orderId, paymentId, items } = currentGcashOrder;
  currentGcashOrder = null;

  for (const item of items) {
    try {
      await pb.collection('products').update(item.id, { "stocks+": item.quantity });
    } catch (err) {
      console.error('Failed to restore stock for', item.id, err);
    }
  }

  try {
    await pb.collection('orders').update(orderId, { payment_status: "Cancelled" });
    await pb.collection('payment').update(paymentId, { status: "Cancelled" });
  } catch (err) {
    console.error('Failed to mark order cancelled:', err);
  }
}

gcashQrCancel.addEventListener("click", () => {
  stopQrWaiting();
  gcashQrModal.classList.add("hidden");
  gcashQrModal.classList.remove("flex");
  cancelGcashOrder();
});