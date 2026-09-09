const categoryButtons = document.querySelectorAll(".category-btn");
const productCards = document.querySelectorAll(".product-card");

categoryButtons.forEach((button) => {//for category buttons
  button.addEventListener("click", () => {

    const selectedCategory = button.dataset.category; //get the category that was clciked

    // CHANGE CATEGORY BUTTON COLORS
    categoryButtons.forEach((btn) => {

      //reset all buttons backgrounds if active
      btn.classList.remove(
        "bg-primary-800",
        "text-white",
        "border-primary-800"
      );

      btn.classList.add(
        "bg-white",
        "text-secondary-600",
        "border-neutral-200"
      );
    });

    //activate clicked button
    button.classList.remove(
      "bg-white",
      "text-secondary-600",
      "border-neutral-200"
    );

    button.classList.add(
      "bg-primary-800",
      "text-white",
      "border-primary-800"
    );

    //show and hide products
    productCards.forEach((card) => {

      const productCategory = card.dataset.category;

      if (
        selectedCategory === "all" ||
        productCategory === selectedCategory
      ) {
        //if category = product -- show
        card.classList.remove("hidden");

        //not show
      } else {
        card.classList.add("hidden");
      }

    });

  });
});