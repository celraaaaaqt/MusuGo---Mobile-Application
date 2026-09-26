import { pb } from "../lib/pb.js";

const statusCard = document.getElementById("status-card");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

const statusStyles = {
  Pending: { label: "Pending", color: "text-yellow-600 bg-yellow-50" },
  Paid: { label: "Paid", color: "text-green-600 bg-green-50" },
  Cancelled: { label: "Cancelled", color: "text-red-600 bg-red-50" },
};

async function loadOrder() {
  if (!orderId) {
    statusCard.innerHTML = `<p class="text-red-600">No order ID provided.</p>`;
    return;
  }

  try {
    const order = await pb.collection("orders").getOne(orderId, {
      expand: "cart_items,cart_items.product",
    });

    const items = order.expand?.cart_items || [];
    const style = statusStyles[order.payment_status] || {
      label: order.payment_status,
      color: "text-neutral-600 bg-neutral-100",
    };

    const itemsHtml = items
      .map((ci) => {
        const name = ci.expand?.product?.product_name || "Item";
        return `
          <div class="flex justify-between text-sm py-1">
            <span>${ci.quantity} × ${name}</span>
            <span>₱${(ci.price * ci.quantity).toFixed(2)}</span>
          </div>
        `;
      })
      .join("");

    statusCard.innerHTML = `
      <h1 class="text-lg font-bold text-primary-800 mb-1">MusuGo</h1>
      <p class="text-sm text-neutral-500 mb-4">Order #${order.order_number}</p>

      <span class="inline-block px-3 py-1 rounded-full text-sm font-semibold ${style.color} mb-4">
        ${style.label}
      </span>

      <div class="text-left border-t border-neutral-200 pt-3 mt-2">
        ${itemsHtml}
      </div>

      <div class="flex justify-between font-bold text-base border-t border-neutral-200 mt-3 pt-3">
        <span>Total</span>
        <span>₱${Number(order.total).toFixed(2)}</span>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load order:", err);
    statusCard.innerHTML = `<p class="text-red-600">Order not found.</p>`;
  }
}

loadOrder();