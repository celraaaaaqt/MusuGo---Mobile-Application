let cart = [];

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


// ================================
// ADD TO CART
// ================================

document.querySelectorAll(".add-cart").forEach((button) => {

  button.addEventListener("click", () => {

    const name = button.dataset.name;
    const price = Number(button.dataset.price);

    const existingItem = cart.find(
      (item) => item.name === name
    );

    if (existingItem) {

      existingItem.quantity++;

    } else {

      cart.push({
        name: name,
        price: price,
        quantity: 1
      });

    }

    updateCartCount();

  });

});

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


      <div class="font-bold text-secondary-600 min-w-[60px] text-right">

        ₱${item.price * item.quantity}

      </div>

    `;


    cartItems.appendChild(itemElement);

  });


  // Update totals

  cartTotalItems.textContent = totalItems;

  cartTotalPrice.textContent =
    `₱${totalPrice}`;


  // ================================
  // DECREASE ITEM
  // ================================

  document.querySelectorAll(".decrease-item").forEach((button) => {

    button.addEventListener("click", () => {

      const index = Number(button.dataset.index);

      cart[index].quantity--;

      if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
      }

      updateCartCount();
      renderCart();

    });

  });


  // ================================
  // INCREASE ITEM
  // ================================

  document.querySelectorAll(".increase-item").forEach((button) => {

    button.addEventListener("click", () => {

      const index = Number(button.dataset.index);

      cart[index].quantity++;

      updateCartCount();
      renderCart();

    });

  });

}