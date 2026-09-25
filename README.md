    # MusuGo

    MusuGo is a mobile-friendly food ordering application built with Tauri and Vite. It lets users browse menu items, filter by category, search for products, add items to a cart, choose a payment method, and complete a checkout flow for a restaurant-style ordering experience. The project also includes an Express server for PayMongo payment intent creation and webhook handling.

    ## Features

    - Product browsing with a responsive storefront UI
    - Search menu items by name
    - Category filtering for menu products
    - Cart management with add, increase, decrease, and clear actions
    - Checkout flow with Cash and GCash payment options
    - Order confirmation modal with an order number 
    - PocketBase-backed product data loading
    - Tauri wrapper for desktop and Android builds
    - Express server for PayMongo payment processing

    ## Tech Stack

    - Frontend: HTML, JavaScript, CSS
    - Frontend build: Vite
    - Styling: Tailwind CSS
    - Desktop/mobile wrapper: Tauri 2
    - Rust runtime: Tauri app shell
    - Data client: PocketBase JavaScript SDK
    - Backend: Express.js
    - Payment provider: PayMongo API
    - UI helpers: SweetAlert2, Font Awesome, Google Fonts
    - Package manager: npm
    - Tauri tooling dependency: Bun

    ## Project Structure

    ```text
    musugo-app/
    ├── index.html                  # Main storefront UI and modal layout
    ├── package.json                # Frontend scripts and dependencies
    ├── vite.config.js              # Vite configuration and frontend build settings
    ├── package-lock.json           # npm lockfile
    ├── README.md                   # Project documentation
    ├── PROJECT_STRUCTURE.md        # Project layout notes
    ├── server/
    │   └── server.js               # Express server for PayMongo payment intents and webhooks
    ├── src/
    │   ├── main.js                 # App bootstrap entry point
    │   ├── styles.css              # Global styling and theme classes
    │   ├── assets/
    │   │   ├── heros/              # Hero/banner images
    │   │   └── menu/               # Menu/product images
    │   ├── interactivity/
    │   │   ├── cart.js             # Cart logic and localStorage persistence
    │   │   ├── checkout.js         # Checkout, payment, and order placement logic
    │   │   ├── product_category.js # Category filtering logic
    │   │   └── search_products.js # Search interaction logic
    │   └── lib/
    │       └── pb.js              # PocketBase client instance
    ├── src-tauri/
    │   ├── Cargo.toml              # Rust/Tauri project configuration
    │   ├── build.rs                # Rust build script
    │   ├── tauri.conf.json         # App metadata, window settings, and build hooks
    │   ├── capabilities/           # Tauri permissions and capability configs
    │   ├── gen/                    # Generated Android/Tauri project files
    │   ├── icons/                  # App icon assets
    │   └── src/
    │       ├── lib.rs              # Rust library entry point
    │       └── main.rs             # Tauri app entry point
    ├── dist/                       # Generated production frontend build
    ├── .gitignore                  # Git ignore rules
    └── .vscode/                    # Editor workspace settings
    ```

    ## Prerequisites

    Before running the app, make sure the following are installed:

    - Node.js 18+ or a compatible LTS version
    - npm
    - Bun, because the Tauri config uses `bun run dev` and `bun run build`
    - Rust toolchain (`rustc` and `cargo`)
    - Android SDK / Android Studio if you plan to build for Android with Tauri

    ## Installation

    From the project root:

    ```bash
    npm install
    ```

    If Bun is not installed yet:

    ```bash
    npm install -g bun
    ```

    Confirm the installation:

    ```bash
    bun --version
    ```

    ## Environment Variables

    The repository does not include a `.env.example` or `.env` file. The Express server in `server/server.js` expects the following values to be present in the environment:

    ```bash
    PAYMONGO_SECRET_KEY=your_paymongo_secret_key
    PAYMONGO_WEBHOOK_SECRET=your_paymongo_webhook_secret
    POCKETBASE_URL=https://your-pocketbase-instance
    PB_SUPERUSER_EMAIL=superuser@example.com
    PB_SUPERUSER_PASSWORD=superuser_password
    PORT=3000
    ```

    ### Variable purposes

    - `PAYMONGO_SECRET_KEY`: used to create the Basic auth header for PayMongo API requests
    - `PAYMONGO_WEBHOOK_SECRET`: intended for verifying incoming webhook signatures
    - `POCKETBASE_URL`: URL for the PocketBase instance
    - `PB_SUPERUSER_EMAIL`: PocketBase superuser email for server-side auth
    - `PB_SUPERUSER_PASSWORD`: PocketBase superuser password for server-side auth
    - `PORT`: port for the Express server; defaults to `3000`

    ## Running the Project

    ### Frontend development server

    ```bash
    npm run dev
    ```

    ### Production frontend build

    ```bash
    npm run build
    ```

    ### Tauri desktop app

    ```bash
    npm run tauri -- dev
    ```

    ### Android app

    ```bash
    npm run tauri:android
    ```

    ### Android APK build

    ```bash
    npm run tauri:build
    ```

    ### Payment server

    The Express payment server is started with Node:

    ```bash
    PORT=3000 node server/server.js
    ```

    ## API Endpoints

    The Express server exposes these routes:

    ### `POST /api/create-intent`

    Creates a PayMongo payment intent using order details.

    Example request body:

    ```json
    {
    "amount": 250,
    "orderId": "abc123",
    "orderNumber": "#1001"
    }
    ```

    Example response:

    ```json
    {
    "paymentIntentId": "pi_...",
    "clientKey": "pi_..._secret_..."
    }
    ```

    ### `POST /api/paymongo-webhook`

    Receives PayMongo webhook events and updates the related PocketBase order/payment records when a payment is marked as paid.

    ## Usage Flow

    1. Open the app and browse menu items
    2. Search or filter by category
    3. Add items to the cart
    4. Review the cart contents
    5. Proceed to checkout
    6. Choose Cash or GCash as the payment method
    7. Place the order
    8. The payment server handles payment-intent setup and webhook updates

    ## Data Layer

    The frontend initializes PocketBase in `src/lib/pb.js`:

    ```js
    import PocketBase from 'pocketbase';

    export const pb = new PocketBase('https://pocketbase-w6ytcy.nibrun.app');
    ```

    The app fetches active products from the `products` collection and expands related category data:

    ```js
    const products = await pb.collection('products').getFullList({
    sort: 'product_name',
    filter: 'is_active = true',
    expand: 'product_category',
    });
    ```

    ## Testing

    No automated test framework or `test` script was detected in the repository, so there is no defined test command at this time.

    ## Contributing

    Contributions are welcome for UI improvements, checkout behavior, payment handling, or Tauri packaging updates. A simple workflow is:

    1. Fork the repository
    2. Create a feature branch
    3. Make focused changes
    4. Validate with the relevant frontend or Tauri command
    5. Open a pull request with a clear description

    ## License

    No license file was found in the repository, so no explicit license is currently declared.