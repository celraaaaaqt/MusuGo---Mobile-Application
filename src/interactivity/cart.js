let cart = JSON.parse(localStorage.getItem("cart")) || [];
const MAX_ITEMS_PER_ORDER = 10; //order items limit

function getTotalQuantity() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

const cartButton = document.getElementById("cart-button"); //button to enter the modal
const cartModal = document.getElementById("cart-modal"); //main div
const closeCart = document.getElementById("close-cart"); //x button in the cart
const cancelButton = document.getElementById("cancel-button");// for cancel

const cartItems = document.getElementById("cart-items"); //itemss in the cart
const emptyCart = document.getElementById("empty-cart"); //thiss will display if the customer doesnt have any orders

const cartCount = document.getElementById("cart-count"); // the display number per order
const cartTotalItems = document.getElementById("cart-total-items"); //modal total items countings
const cartTotalPrice = document.getElementById("cart-total-price"); //modal total price countings

//if customer clicked the view orders, the modal will show
cartButton.addEventListener("click", () => {
  cartModal.classList.remove("hidden");
  renderCart();
});

//if the user clicked x, the modal will close here
closeCart.addEventListener("click", () => {
  cartModal.classList.add("hidden");
});

//cancel button
cancelButton.addEventListener("click", () => {

  if (cart.length === 0) {
    return;
  }

  //confirmation modal for cancel and checkoout
  Swal.fire({
    title: "Cancel order?",
    text: "All items in your cart will be removed.",
    icon: "warning",

    showCancelButton: true,

    confirmButtonText: "Yes, clear cart",
    cancelButtonText: "Keep orders",

    reverseButtons: true,

    customClass: {
      actions: "swal-actions",
      confirmButton: "swal-confirm",
      cancelButton: "swal-cancel" 
    },

    buttonsStyling: false
  }).then((result) => {

    if (result.isConfirmed) {

      //clears the cart
      cart = [];
saveCart();
      //update cart count
      updateCartCount();

      //update the cart modal
      renderCart();

      //close the modal
      cartModal.classList.add("hidden");
    }

  });

});


//automatically close when the user clicked any keys outside the modal
cartModal.addEventListener("click", (event) => {
  if (event.target === cartModal) {
    cartModal.classList.add("hidden");
  }
});


//add to cart (view orders)
document.addEventListener("click", (event) => {
  const button = event.target.closest(".add-cart");
  if (!button) return;

  const id = button.dataset.id;
  const name = button.dataset.name;
  const price = Number(button.dataset.price);

  //these products aren't backed by a real PocketBase record (e.g. the
  //static fallback cards shown if the menu failed to load) — checkout
  //would break trying to look them up, so block it here instead
  if (!id) {
    showErrorToast("Menu is still loading — please try again in a moment.");
    return;
  }

  if (getTotalQuantity() >= MAX_ITEMS_PER_ORDER) {
  showErrorToast(`Limit of ${MAX_ITEMS_PER_ORDER} items per order`);
  return;
}

  const existingItem = cart.find((item) => item.id === id);

  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({ id: id, name: name, price: price, quantity: 1 });
  }

  saveCart();
  updateCartCount();
  showAddedToast(name);
});

const toastContainer = document.getElementById("toast-container");

//lightweight, non-blocking "added to cart" pill —
//pointer-events-none end to end so it never blocks taps on the menu
//behind it, and it never dims or blurs the page
function showAddedToast(name) {
  const toast = document.createElement("div");

  toast.className =
    "pointer-events-none inline-flex items-center gap-3 " +
    "bg-neutral-900/90 backdrop-blur-md text-white " +
    "rounded-full pl-2 pr-5 py-2 " +
    "shadow-xl shadow-black/20 " +
    "opacity-0 -translate-y-4 scale-95 " +
    "transition-all duration-300 ease-out";

  toast.innerHTML = `
    <span class="w-7 h-7 shrink-0 rounded-full bg-primary-500 flex items-center justify-center text-xs">
      <i class="fa fa-check"></i>
    </span>
    <span class="text-sm font-semibold whitespace-nowrap">
      ${name} added
    </span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "-translate-y-4", "scale-95");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "-translate-y-2", "scale-95");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 1200);
}

//same pill style, red variant — used when an add-to-cart click can't be honored
function showErrorToast(message) {
  const toast = document.createElement("div");

  toast.className =
    "pointer-events-none inline-flex items-center gap-3 " +
    "bg-red-600/95 backdrop-blur-md text-white " +
    "rounded-full pl-2 pr-5 py-2 " +
    "shadow-xl shadow-black/20 " +
    "opacity-0 -translate-y-4 scale-95 " +
    "transition-all duration-300 ease-out";

  toast.innerHTML = `
    <span class="w-7 h-7 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-xs">
      <i class="fa fa-exclamation"></i>
    </span>
    <span class="text-sm font-semibold whitespace-nowrap">
      ${message}
    </span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "-translate-y-4", "scale-95");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "-translate-y-2", "scale-95");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 2000);
}

//for updaating cart count
function updateCartCount() {

  const totalQuantity = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  cartCount.textContent = totalQuantity;

}

//cart data renderer
function renderCart() {

  cartItems.innerHTML = "";

  if (cart.length === 0) {

    cartItems.classList.add("hidden");

    emptyCart.classList.remove("hidden");
    emptyCart.classList.add("flex");

  } else {

    cartItems.classList.remove("hidden");

    emptyCart.classList.add("hidden");
    emptyCart.classList.remove("flex");

  }


  let totalItems = 0;
  let totalPrice = 0;


  cart.forEach((item, index) => {

    totalItems += item.quantity;
    totalPrice += item.price * item.quantity;


    const itemElement = document.createElement("div");

    itemElement.className =
      "flex items-center justify-between gap-3 " +
      "p-4 rounded-2xl bg-white border border-neutral-200";


    itemElement.innerHTML = `

      <div class="flex-1">

        <h3 class="font-semibold text-primary-800">
          ${item.name}
        </h3>

        <p class="text-sm text-neutral-500 mt-1">
          ₱${item.price}
        </p>

      </div>


      <div class="flex items-center gap-2">

        <button
          class="decrease-item w-9 h-9 rounded-lg
                 bg-neutral-100 hover:bg-neutral-200
                 font-bold"
          data-index="${index}"
        >
          −
        </button>


        <span class="w-6 text-center font-semibold">
          ${item.quantity}
        </span>


        <button
          class="increase-item w-9 h-9 rounded-lg
                 bg-primary-500 hover:bg-primary-600
                 text-white font-bold"
          data-index="${index}"
        >
          +
        </button>

      </div>


      <div class="font-bold text-secondary-600 min-w-15 text-right">

        ₱${item.price * item.quantity}

      </div>

    `;


    cartItems.appendChild(itemElement);

  });


  //uppdate totals

  cartTotalItems.textContent = totalItems;

  cartTotalPrice.textContent =
    `₱${totalPrice}`;

  //decrease items

  document.querySelectorAll(".decrease-item").forEach((button) => {

    button.addEventListener("click", () => {
      
      const index = Number(button.dataset.index);

      cart[index].quantity--;

      if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
      }
saveCart();
      updateCartCount();
      renderCart();

    });

  });

  //increase item
  document.querySelectorAll(".increase-item").forEach((button) => {

    button.addEventListener("click", () => {
      if (getTotalQuantity() >= MAX_ITEMS_PER_ORDER) {
  showErrorToast(`Limit of ${MAX_ITEMS_PER_ORDER} items per order`);
  return;
}
      const index = Number(button.dataset.index);

      cart[index].quantity++;
saveCart();
      updateCartCount();
      renderCart();

    });

  });

}

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

//for clearing all localItem in cart here
export function clearCart() {
  cart = [];
  localStorage.removeItem("cart");
  updateCartCount();
  renderCart();
}

export function getCart() {
  return cart;
}
updateCartCount();