import { pb } from '../lib/pb.js';
import { syncCartBadges } from './cart.js';

const productGrid = document.getElementById('product-grid');
const categoryButtons = document.querySelectorAll('.category-btn');
const searchInput = document.getElementById('search-input');

let currentCategory = 'all';

async function loadProducts() {
  try {
    const products = await pb.collection('products').getFullList({
      sort: 'product_name',
      filter: 'is_active = true',
      expand: 'product_category', //pulls in the related category record
    });
    renderProducts(products);
    applyFilters();
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
    class="product-card group relative bg-white rounded-3xl border border-primary-300 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] transition-all duration-200"
    data-category="${categoryName}"
    data-name="${p.product_name}"
    data-id="${p.id}"
  >
    <div class="aspect-square bg-gradient-to-br from-primary-50 to-tertiary-50 relative overflow-hidden">
      ${imageUrl
        ? `<img class="w-full h-full object-cover ${inStock ? 'group-hover:scale-105 transition-transform duration-300' : 'grayscale'}" src="${imageUrl}" alt="${p.product_name}" />`
        : `<div class="w-full h-full flex items-center justify-center text-neutral-400 text-sm">No image</div>`
      }

      ${categoryName ? `
        <span class="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-primary-100 backdrop-blur-sm text-primary-800 text-[11px] font-bold uppercase tracking-wide shadow-sm">
          ${categoryName}
        </span>
      ` : ''}

      <span
        class="cart-qty-badge absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary-600 text-white text-xs font-bold items-center justify-center shadow-sm hidden"
        data-qty-for="${p.id}"
      ></span>

      ${!inStock ? `
        <div class="absolute inset-0 bg-neutral-900/60 backdrop-blur-[1px] flex items-center justify-center">
          <span class="px-4 py-1.5 rounded-full bg-primary-200 text-primary-800 text-xs font-bold uppercase tracking-wide">
            Out of Stock
          </span>
        </div>
      ` : ''}
    </div>

    <div class="p-5">
      <h4 class="font-jakarta font-bold text-sm sm:text-base md:text-lg text-primary-800 leading-snug line-clamp-2 min-h-[2.5em]">${p.product_name}</h4>
      <div class="flex items-center justify-between mt-3">
        <span class="font-jakarta font-bold text-lg text-secondary-600">₱${p.price}</span>
        <button
          class="add-cart w-11 h-11 rounded-xl text-white flex items-center justify-center text-xl font-medium transition active:scale-90 ${
            inStock
              ? 'bg-primary-500 hover:bg-primary-600 shadow-sm shadow-primary-500/30'
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

  syncCartBadges();
}

// Combined filter — checks BOTH the selected category AND the search text
// together, so they never fight over the same .hidden class. Called after
// every render (including realtime re-renders), every category click, and
// every search keystroke.
function applyFilters() {
  const searchText = (searchInput?.value || '').toLowerCase();
  const productCards = document.querySelectorAll('.product-card');

  productCards.forEach((card) => {
    const productCategory = card.dataset.category;
    const productName = card.dataset.name.toLowerCase();

    const matchesCategory = currentCategory === 'all' || productCategory === currentCategory;
    const matchesSearch = productName.includes(searchText);

    if (matchesCategory && matchesSearch) {
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

      applyFilters();
    });
  });
}

// attaches the search input listener once — same pattern as category buttons
function attachSearchFilter() {
  if (!searchInput) return;
  searchInput.addEventListener('input', applyFilters);
}

attachCategoryFilter();
attachSearchFilter();
loadProducts();

// keep stock status live: whenever any product record changes (e.g. an admin
// updates `stocks`), reload and re-render the grid automatically
pb.collection('products').subscribe('*', () => {
  loadProducts();
});