  import { pb } from '../lib/pb.js';

  const productGrid = document.getElementById('product-grid');
  const categoryButtons = document.querySelectorAll('.category-btn');

  async function loadProducts() {
    try {
      const products = await pb.collection('products').getFullList({
        sort: 'product_name',
        filter: 'is_active = true',
        expand: 'product_category', //pulls in the related category record 
      });
      console.log(products);
      renderProducts(products);
      attachCategoryFilter(); 
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }

  function renderProducts(products) {
    productGrid.innerHTML = products.map((p) => {
      const categoryName = p.expand?.product_category?.name ?? '';
      const imageUrl = p.product_image ? pb.files.getURL(p, p.product_image) : null;

      return `
        <article
          class="product-card group bg-white rounded-3xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition"
          data-category="${categoryName}"
          data-name="${p.product_name}"
        >
          <div class="aspect-square bg-gradient-to-br from-primary-50 to-tertiary-50 flex items-center justify-center">
            ${imageUrl
              ? `<img class="w-full h-full object-cover" src="${imageUrl}" alt="${p.product_name}" />`
              : `<span class="text-neutral-400 text-sm">No image</span>`
            }
          </div>
          <div class="p-4">
            <h4 class="font-jakarta font-bold text-base text-primary-800">${p.product_name}</h4>
            <div class="flex items-center justify-between mt-4">
              <span class="font-jakarta font-bold text-lg text-secondary-600">₱${p.price}</span>
              <button
                class="add-cart w-12 h-12 rounded-xl bg-primary-500 hover:bg-primary-600 text-white flex items-center justify-center text-2xl font-medium active:scale-90 transition"
                data-id="${p.id}"
                data-name="${p.product_name}"
                data-price="${p.price}"
              >
                +
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function attachCategoryFilter() {
    const productCards = document.querySelectorAll('.product-card');
    categoryButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const selectedCategory = button.dataset.category;
        categoryButtons.forEach((btn) => {
          btn.classList.remove('bg-primary-800', 'text-white', 'border-primary-800');
          btn.classList.add('bg-white', 'text-secondary-600', 'border-neutral-200');
        });
        button.classList.remove('bg-white', 'text-secondary-600', 'border-neutral-200');
        button.classList.add('bg-primary-800', 'text-white', 'border-primary-800');

        productCards.forEach((card) => {
          const productCategory = card.dataset.category;
          if (selectedCategory === 'all' || productCategory === selectedCategory) {
            card.classList.remove('hidden');
          } else {
            card.classList.add('hidden');
          }
        });
      });
    });
  }

  loadProducts();