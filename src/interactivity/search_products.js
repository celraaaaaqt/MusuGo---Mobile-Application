const searchInput = document.getElementById("search-input");
const productCards = document.querySelectorAll(".product-card");

searchInput.addEventListener("input", () => {
const searchText = searchInput.value.toLowerCase();

productCards.forEach((card) => {
    const productName = card.dataset.name.toLowerCase();

    if(productName.includes(searchText)) {
        card.classList.remove("hidden");
    } else {
        card.classList.add("hidden");
    }
});
});
