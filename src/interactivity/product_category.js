import { pb } from '../lib/pb.js';

const productGrid = document.getElementById('product-grid');
const categoryButtons = document.querySelectorAll('.category-btn');

let currentCategory = 'all';

async function loadProducts() {
  try {
    const products = await pb.collection('products').getFullList({
      sort: 'product_name',
      filter: 'is_active = true',
      expand: 'product_category', //pulls in the related category record
    });
    renderProducts(products);
    applyCategoryFilter();
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function renderProducts(products) {
  productGrid.innerHTML = products.map((p) => {
    const categoryName = p.expand?.product_category?.name ?? '';
    const imageUrl = p.product_image ? pb.files.getURL(p, p.product_image) : null;
    const inStock = (p.stocks ?? 0) > 0;

    return `
      <article
        class="product-card group bg-white rounded-3xl border border-primary-800 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition ${inStock ? '' : 'opacity-50 grayscale'}"
        data-category="${categoryName}"
        data-name="${p.product_name}"
      >
        <div class="aspect-square bg-gradient-to-br from-primary-50 to-tertiary-50 flex items-center justify-center relative">
          ${imageUrl
            ? `<img class="w-full h-full object-cover" src="${imageUrl}" alt="${p.product_name}" />`
            : `<span class="text-neutral-400 text-sm">No image</span>`
          }
          ${!inStock ? `
            <span class="absolute top-2 left-2 px-3 py-1 rounded-full bg-neutral-800/80 text-white text-xs font-semibold">
              Out of stock
            </span>
          ` : ''}
        </div>
        <div class="p-4">
          <h4 class="font-jakarta font-bold text-base text-primary-800">${p.product_name}</h4>
          <div class="flex items-center justify-between mt-4">
            <span class="font-jakarta font-bold text-lg text-secondary-600">₱${p.price}</span>
            <button
              class="add-cart w-12 h-12 rounded-xl text-white flex items-center justify-center text-2xl font-medium transition ${
                inStock
                  ? 'bg-primary-500 hover:bg-primary-600 active:scale-90'
                  : 'bg-neutral-300 cursor-not-allowed'
              }"
              data-id="${p.id}"
              data-name="${p.product_name}"
              data-price="${p.price}"
              ${inStock ? '' : 'disabled'}
            >
              +
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// re-applies the currently selected category filter (used after every render,
// including realtime re-renders, so out-of-stock refresh doesn't reset the filter)
function applyCategoryFilter() {
  const productCards = document.querySelectorAll('.product-card');
  productCards.forEach((card) => {
    const productCategory = card.dataset.category;
    if (currentCategory === 'all' || productCategory === currentCategory) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// attaches category button click listeners once — product cards get
// re-rendered on every load, but the category buttons themselves don't
function attachCategoryFilter() {
  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentCategory = button.dataset.category;

      categoryButtons.forEach((btn) => {
        btn.classList.remove('bg-primary-800', 'text-white', 'border-primary-800');
        btn.classList.add('bg-white', 'text-secondary-600', 'border-neutral-200');
      });
      button.classList.remove('bg-white', 'text-secondary-600', 'border-neutral-200');
      button.classList.add('bg-primary-800', 'text-white', 'border-primary-800');

      applyCategoryFilter();
    });
  });
}

attachCategoryFilter();
loadProducts();

// keep stock status live: whenever any product record changes (e.g. an admin
// updates `stocks`), reload and re-render the grid automatically
pb.collection('products').subscribe('*', () => {
  loadProducts();
});