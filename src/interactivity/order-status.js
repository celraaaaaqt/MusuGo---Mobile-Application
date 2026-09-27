import { pb } from "../lib/pb.js";

const statusCard = document.getElementById("status-card");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

const statusStyles = {
  Pending: { label: "Pending", color: "text-yellow-600 bg-yellow-50" },
  Paid: { label: "Paid", color: "text-green-600 bg-green-50" },
  Cancelled: { label: "Cancelled", color: "text-red-600 bg-red-50" },
};

// Set once loadOrder() fetches successfully, read by the submit-rating
// handler below — a normal module-level variable, since both live in
// this one file (replaces the earlier window.__currentOrder idea).
let currentOrder = null;

function buildRatingSection(order) {
  const alreadyRated =
    (order.expand?.customer_ratings_via_customer_order?.length || 0) > 0;

  if (order.payment_status !== "Paid") {
    return ""; // nothing to rate until the order is actually paid
  } 

  if (alreadyRated) {
    return `
      <div class="mt-6 pt-5 border-t border-neutral-200">
        <p class="text-center text-sm text-neutral-500">Thanks for your feedback! ⭐</p>
      </div>
    `;
  }

  return `
    <div id="rating-section" class="mt-6 pt-5 border-t border-neutral-200">
      <p class="text-center font-semibold text-neutral-700 mb-3">How was your order?</p>

      <div id="star-picker" class="flex justify-center gap-2 mb-4">
        <button type="button" class="star-btn text-3xl text-neutral-300" data-value="1">★</button>
        <button type="button" class="star-btn text-3xl text-neutral-300" data-value="2">★</button>
        <button type="button" class="star-btn text-3xl text-neutral-300" data-value="3">★</button>
        <button type="button" class="star-btn text-3xl text-neutral-300" data-value="4">★</button>
        <button type="button" class="star-btn text-3xl text-neutral-300" data-value="5">★</button>
      </div>

      <textarea
        id="feedback-text"
        rows="3"
        placeholder="Any feedback? (optional)"
        class="w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-primary-500"
      ></textarea>

      <button
        id="submit-rating"
        class="mt-3 w-full h-11 rounded-xl bg-primary-800 hover:bg-primary-900 text-white font-semibold transition"
      >
        Submit Rating
      </button>
    </div>
  `;
}

function attachRatingListeners() {
  const ratingSection = document.getElementById("rating-section");
  if (!ratingSection) return; // already rated / not paid yet — nothing to wire up

  let selectedStars = 0;
  const starButtons = ratingSection.querySelectorAll(".star-btn");
  const feedbackText = document.getElementById("feedback-text");
  const submitRatingBtn = document.getElementById("submit-rating");

  starButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedStars = Number(btn.dataset.value);
      starButtons.forEach((b) => {
        const isFilled = Number(b.dataset.value) <= selectedStars;
        b.classList.toggle("text-yellow-400", isFilled);
        b.classList.toggle("text-neutral-300", !isFilled);
      });
    });
  });

  submitRatingBtn.addEventListener("click", async () => {
    if (selectedStars === 0) {
      alert("Please select a star rating first.");
      return;
    }

    submitRatingBtn.disabled = true;

    try {
      const customerInfoId =
        currentOrder?.expand?.customer_info_via_orders?.[0]?.id;

      await pb.collection("customer_ratings").create({
        customer_order: orderId,
        customer_name: customerInfoId, // relation to the customer_info record
        rating: String(selectedStars),
        feedback: feedbackText.value.trim(),
      });

      ratingSection.innerHTML = `
        <p class="text-center text-sm text-neutral-500">Thanks for your feedback! ⭐</p>
      `;
    } catch (err) {
      console.error("Failed to submit rating:", err);
      alert("Something went wrong submitting your rating. Please try again.");
      submitRatingBtn.disabled = false;
    }
  });
}

async function loadOrder() {
  if (!orderId) {
    statusCard.innerHTML = `<p class="text-red-600">No order ID provided.</p>`;
    return;
  }

  try {
    const order = await pb.collection("orders").getOne(orderId, {
      expand:
        "cart_items,cart_items.product,customer_info_via_orders,customer_ratings_via_customer_order",
    });

    currentOrder = order;

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

      ${buildRatingSection(order)}
    `;

    attachRatingListeners();
  } catch (err) {
    console.error("Failed to load order:", err);
    statusCard.innerHTML = `<p class="text-red-600">Order not found.</p>`;
  }
}

loadOrder();