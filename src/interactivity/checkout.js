import { pb } from '../lib/pb.js';
import { clearCart, getCart } from "./cart.js";


const checkoutItems = document.querySelector("#checkout-items");
const checkoutTotal = document.querySelector("#checkout-total");

const checkoutModal = document.getElementById("checkout-modal");
const checkoutButton = document.getElementById("checkout-button");
const closeCheckout = document.getElementById("close-checkout");
const backToCart = document.getElementById("back-to-cart");
const cartModal = document.getElementById("cart-modal");

//for payment method
const cashPayment = document.getElementById("cash-payment");
const gcashPayment = document.getElementById("gcash-payment");

const cashSection = document.getElementById("cash-section");
const gcashSection = document.getElementById("gcash-section");

const cashReceived = document.getElementById("cash-received");
const cashChange = document.getElementById("cash-change");

const gcashTotal = document.getElementById("gcash-total");

const placeOrder = document.getElementById("place-order");

//order confirmations variables
const orderSuccessModal = document.getElementById("order-success-modal");

const successOrderNumber = document.getElementById("success-order-number");

//order processing loaing or inicatorr
const processingModal = document.getElementById("processing-modal");
const doneOrder = document.getElementById("done-order");

//open checkout
checkoutButton.addEventListener("click", () => {

  checkoutModal.classList.remove("hidden");
  cartModal.classList.add("hidden");

  renderCheckout();

});



//close checkout
closeCheckout.addEventListener("click", () => {

  checkoutModal.classList.add("hidden");

});



//back to cart
backToCart.addEventListener("click", () => {

  checkoutModal.classList.add("hidden");
  cartModal.classList.remove("hidden");

});



//render the checkout
function renderCheckout() {

 const cart = getCart();

  checkoutItems.innerHTML = "";

  let total = 0;


  //if cart is empty
  if (cart.length === 0) {

    checkoutItems.innerHTML = `
      <p class="text-center text-neutral-500 py-6">
        Your cart is empty.
      </p>
    `;

    checkoutTotal.textContent = "₱0";

    return;
  }
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

if (totalQuantity > 10) {
  Swal.fire({
    icon: "warning",
    title: "Order limit exceeded",
    text: "You can order up to 10 items per order. Please adjust your cart."
  });

  return;
}

  //display each items
  cart.forEach((item) => {

    const itemTotal =
      item.price * item.quantity;

    total += itemTotal;


    const itemElement =
      document.createElement("div");

    itemElement.classList.add(
      "flex",
      "items-center",
      "justify-between",
      "py-3"
    );


    itemElement.innerHTML = `
      <div>

        <p class="font-semibold">
          ${item.name}
        </p>

        <p class="text-sm text-gray-500">
          ${item.quantity} × ₱${item.price.toFixed(2)}
        </p>

      </div>

      <p class="font-semibold">
        ₱${itemTotal.toFixed(2)}
      </p>
    `;


    checkoutItems.appendChild(itemElement);

  });

  //display total
  checkoutTotal.textContent =
    `₱${total.toFixed(2)}`;

}

function selectCash() {
  cashPayment.classList.add(
    "bg-primary-800",
    "text-white",
    "border-primary-600"
  );

  cashPayment.classList.remove(
    "bg-white",
    "text-neutral-700",
    "border-neutral-200"
  );

  gcashPayment.classList.add(
    "bg-white",
    "text-neutral-700",
    "border-neutral-200"
  );

  gcashPayment.classList.remove(
    "bg-primary-500",
    "text-white",
    "border-primary-500"
  );
}


function selectGCash() {
  gcashPayment.classList.add(
    "bg-primary-800",
    "text-white",
    "border-primary-600"
  );

  gcashPayment.classList.remove(
    "bg-white",
    "text-neutral-700",
    "border-neutral-200"
  );

  cashPayment.classList.add(
    "bg-white",
    "text-neutral-700",
    "border-neutral-200"
  );

  cashPayment.classList.remove(
    "bg-primary-500",
    "text-white",
    "border-primary-500"
  );
}


//PAYMenT METHOD

// Cash payment
cashPayment.addEventListener("click", () => {

      selectCash();

  cashSection.classList.remove("hidden");
  gcashSection.classList.add("hidden");

  updatePaymentTotal();

});

//gCash payment
gcashPayment.addEventListener("click", () => {
selectGCash();
  gcashSection.classList.remove("hidden");
  cashSection.classList.add("hidden");

  updatePaymentTotal();

});


//calculate payment total
function updatePaymentTotal() {

  const cart =
    JSON.parse(localStorage.getItem("cart")) || [];

  let total = 0;

  cart.forEach((item) => {
    total += item.price * item.quantity;
  });

  gcashTotal.textContent =
    `₱${total.toFixed(2)}`;

}


//calculate change
cashReceived.addEventListener("input", () => {

  const cart =
    JSON.parse(localStorage.getItem("cart")) || [];

  let total = 0;

  cart.forEach((item) => {
    total += item.price * item.quantity;
  });

  const received =
    Number(cashReceived.value);

  const change =
    received - total;

  if (received <= 0) {
    cashChange.textContent = "₱0.00";
    return;
  }

  if (change < 0) {
    cashChange.textContent = "Insufficient cash";
    return;
  }

  cashChange.textContent =
    `₱${change.toFixed(2)}`;

});


placeOrder.addEventListener("click", () => {

  const cart = getCart();

  if (cart.length === 0) {
    Swal.fire({
      icon: "warning",
      title: "Cart is empty",
      text: "Please add items before placing an order."
    });

    return;
  }


  // Calculate total
  let total = 0;

  cart.forEach((item) => {
    total += item.price * item.quantity;
  });


  // Get payment method
  let paymentMethod = "";

  if (!cashSection.classList.contains("hidden")) {
    paymentMethod = "Cash";

    const received = Number(cashReceived.value);

    if (received < total) {
      Swal.fire({
        icon: "error",
        title: "Insufficient cash",
        text: "Please enter enough cash to complete the order."
      });

      return;
    }

  } else if (!gcashSection.classList.contains("hidden")) {
    paymentMethod = "GCash";

  } else {

    Swal.fire({
      icon: "warning",
      title: "Select a payment method",
      text: "Please choose Cash or GCash before placing your order."
    });

    return;
  }


  // Build order summary
  const orderSummary = cart.map((item) => {

    const itemTotal =
      item.price * item.quantity;

    return `
      <div class="flex justify-between items-center text-left py-2">
        
        <div>
          <p class="font-semibold">
            ${item.name}
          </p>

          <p class="text-sm text-gray-500">
            ${item.quantity} × ₱${item.price.toFixed(2)}
          </p>
        </div>

        <p class="font-semibold">
          ₱${itemTotal.toFixed(2)}
        </p>

      </div>
    `;

  }).join("");


  //confirmation
  Swal.fire({
    title: "Confirm your order?",
    
    html: `
      <div class="mt-4">

        <div class="divide-y divide-neutral-200">
          ${orderSummary}
        </div>

        <div class="border-t border-neutral-300 mt-4 pt-4">

          <div class="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>₱${total.toFixed(2)}</span>
          </div>

          <div class="flex justify-between text-sm text-gray-500 mt-2">
            <span>Payment</span>
            <span>${paymentMethod}</span>
          </div>

        </div>

      </div>
    `,

    icon: "question",

    showCancelButton: true,

    confirmButtonText: "Confirm Order",
    cancelButtonText: "Go Back",

    reverseButtons: true,

    customClass: {
      actions: "swal-actions",
      confirmButton: "swal-confirm",
      cancelButton: "swal-cancel"
    },

    buttonsStyling: false

  }).then(async (result) => {

   if (!result.isConfirmed) {
      return;
    }

    //show a loading state right away — the PocketBase calls below can take
    //a moment, and the customer shouldn't just be staring at nothing
    checkoutModal.classList.add("hidden");
    processingModal.classList.remove("hidden");
    processingModal.classList.add("flex");

        try {
  // Step A: create one cart_items record per product line + deduct stock
  const cartItemIds = [];
  for (const item of cart) {
    const cartItem = await pb.collection('cart_items').create({
      product: item.id,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
    });
    cartItemIds.push(cartItem.id);

    // deduct stock
    const product = await pb.collection('products').getOne(item.id);
    await pb.collection('products').update(item.id, {
      stocks: Math.max(0, product.stocks - item.quantity),
    });
  }

  // Step A.5: generate order number
  // Step A.5: generate order number (based on today's date + time, no List permission needed)
const now = new Date();
const orderNumber = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;

  // Step B: create the order
  const order = await pb.collection('orders').create({
    order_number: orderNumber,
    cart_items: cartItemIds,
    total: total,
    payment_status: paymentMethod === "Cash" ? "Pending" : "Paid",
  });

  // Step C: create the payment record
  await pb.collection('payment').create({
    order: order.id,
    amount: total,
    payment_method: paymentMethod,
    status: paymentMethod === "Cash" ? "Pending" : "Complete",
  });

  clearCart();

  processingModal.classList.add("hidden");
  processingModal.classList.remove("flex");

  successOrderNumber.textContent = `#${order.order_number}`;
  checkoutModal.classList.add("hidden");
  orderSuccessModal.classList.remove("hidden");
  orderSuccessModal.classList.add("flex");

  cashReceived.value = "";
  cashChange.textContent = "₱0.00";

} catch (err) {
  console.error('Order failed:', err);

  processingModal.classList.add("hidden");
  processingModal.classList.remove("flex");
  checkoutModal.classList.remove("hidden");

  Swal.fire({
    icon: "error",
    title: "Order failed",
    text: "Something went wrong while placing your order. Please try again."
  });
}

  });

});

doneOrder.addEventListener("click", () => {

  orderSuccessModal.classList.add("hidden");
  orderSuccessModal.classList.remove("flex");

});