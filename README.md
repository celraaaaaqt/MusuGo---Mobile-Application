# MusuGo

MusuGo is a restaurant-style ordering application built as a Tauri app with a Vite frontend, PocketBase data layer, and an Express server for PayMongo payment processing. The app is designed for browsing menu items, filtering products, adding them to a cart, choosing a payment method, and completing an order flow.

## Overview

This project combines a mobile-friendly storefront UI with a real backend flow for payments and order tracking. The frontend is a single-page ordering interface written in vanilla JavaScript and styled with Tailwind CSS. The backend runs in Node.js via Express and handles PayMongo payment intent creation, QR Ph checkout, webhook verification, and PocketBase updates.

The Tauri shell allows the app to run as a desktop application and gives support for Android builds through the generated Tauri Android project files.

## Features

- Product catalog with menu cards and pricing
- Search by menu item name
- Category filtering for meal groups
- Cart management for adding, increasing, decreasing, and clearing items
- Checkout modal with Cash and GCash flows
- QR-based GCash payment flow with payment waiting modal and expiry timer
- Order confirmation modal with generated order number
- Local cart storage using browser `localStorage`
- PocketBase integration for menu data and status updates
- PayMongo payment intent and webhook handling
- Tauri packaging for desktop and Android environments

## Tech Stack

- Frontend: HTML, JavaScript, CSS
- UI styling: Tailwind CSS
- Build tooling: Vite
- App wrapper: Tauri 2
- Desktop/mobile runtime: Rust + Tauri shell
- Database/client: PocketBase JS SDK
- Backend API: Express.js
- Payment gateway: PayMongo
- Environment loading: dotenv
- UI helpers: SweetAlert2, Font Awesome, Google Fonts
- Package manager: npm
- Tauri hook dependency: Bun

## Architecture

### Frontend layer

The storefront lives in the root `index.html` and the files under `src/`.

- `index.html` contains the full app layout including the welcome banner, search bar, product grid, cart modal, checkout modal, order progress modal, QR modal, and toast container.
- `src/main.js` bootstraps the app and imports the CSS.
- `src/styles.css` contains the global design styling and theme classes.
- `src/lib/pb.js` initializes the PocketBase client instance connected to a remote PocketBase URL.
- `src/interactivity/cart.js` manages the cart state, rendering, local storage, quantity changes, and checkout opening logic.
- `src/interactivity/product_category.js` loads products from PocketBase and renders category-filtered cards.
- `src/interactivity/search_products.js` filters visible product cards by text input.
- `src/interactivity/checkout.js` controls the checkout and payment method selection flow.
- `src/interactivity/gcash.js` handles GCash QR generation, countdown expiry, waiting state, and payment success callbacks.

### Backend layer

The backend is in `server/server.js` and exposes API routes for payment operations.

- `POST /api/create-intent` creates a PayMongo payment intent.
- `POST /api/create-qrph-intent` creates a QR Ph payment flow and returns a QR code URL for GCash.
- `POST /api/paymongo-webhook` verifies the signature and updates PocketBase when a payment is marked as paid.
- `POST /api/cancel-order` restores inventory and marks the order/payment as cancelled.
- `GET /health` returns a basic health status response.

### Tauri layer

The `src-tauri/` directory contains the Rust/Tauri project configuration for packaging and app lifecycle.

- `src-tauri/Cargo.toml` defines the Rust dependency graph.
- `src-tauri/build.rs` is the Tauri build script.
- `src-tauri/tauri.conf.json` defines app metadata, window size, build commands, and bundle settings.
- `src-tauri/src/lib.rs` and `src-tauri/src/main.rs` are the Rust entry points for the app shell.
- `src-tauri/gen/android/` contains generated Android project files for mobile builds.

## Project Structure

```text
musugo-app/
├── index.html                   # Main storefront UI and modal layout
├── package.json                 # Frontend + server scripts and dependencies
├── package-lock.json            # npm lockfile
├── vite.config.js               # Vite config and dev server settings
├── README.md                    # Project documentation
├── PROJECT_STRUCTURE.md         # Summary of project folders and purpose
├── .gitignore                   # Git ignore rules
├── .vscode/                     # VS Code workspace settings
├── dist/                        # Built frontend output
├── server/
│   └── server.js                # Express PayMongo + PocketBase payment server
├── src/
│   ├── main.js                  # App bootstrap
│   ├── styles.css               # Global styling
│   ├── assets/
│   │   ├── heros/
│   │   └── menu/
│   ├── interactivity/
│   │   ├── cart.js              # Cart logic and local state
│   │   ├── checkout.js          # Checkout and order flow
│   │   ├── gcash.js             # QR payment handling
│   │   ├── product_category.js  # Product filtering
│   │   └── search_products.js   # Search behavior
│   └── lib/
│       └── pb.js                # PocketBase client instance
├── src-tauri/
│   ├── Cargo.toml               # Rust/Tauri package setup
│   ├── build.rs                 # Tauri build script
│   ├── tauri.conf.json          # App metadata and build config
│   ├── capabilities/
│   ├── gen/
│   ├── icons/
│   └── src/
│       ├── lib.rs               # Rust library entry point
│       └── main.rs              # Rust app entry point
└── node_modules/                # Installed dependencies
```

## How the App Works

### 1. Product listing

The app loads active items from the PocketBase `products` collection using the client configured in `src/lib/pb.js`.

```js
import PocketBase from 'pocketbase';

export const pb = new PocketBase('https://pocketbase-w6ytcy.nibrun.app');
```

Products are then rendered in the menu grid, and each card includes `data-name`, `data-category`, and price metadata used by the filtering and cart logic.

### 2. Cart flow

`src/interactivity/cart.js` stores cart data in `localStorage` so the order persists while the user keeps the app open or reloads the page.

The cart supports:

- adding new items
- increasing quantity
- decreasing quantity
- clearing the cart
- showing total price and item count

### 3. Checkout flow

`src/interactivity/checkout.js` handles the checkout process. It calculates totals, shows the selected order, allows payment selection between Cash and GCash, validates payment input for cash, and triggers the order submit workflow.

### 4. GCash/PayMongo flow

`src/interactivity/gcash.js` is responsible for:

- calling `/api/create-qrph-intent`
- receiving the generated QR image URL
- showing the QR modal
- starting countdown expiry logic
- subscribing to the related PocketBase order record so the app can react when payment status changes to `Paid`
- restoring stock and canceling the order if the QR expires or is cancelled

The backend server encrypts and verifies request signatures to ensure PayMongo webhook events come from a trusted origin before updating order records.

### 5. Server-side payment updates

`server/server.js` updates PocketBase on successful payment and marks the payment record as `Complete`. It also restores stock when an order is cancelled or expires.

## Environment Variables

There is no `.env.example` file in the repository, but the backend expects the following environment variables to be configured:

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
- `PAYMONGO_WEBHOOK_SECRET`: used to validate incoming webhook signatures
- `POCKETBASE_URL`: base URL of the PocketBase instance
- `PB_SUPERUSER_EMAIL`: PocketBase superuser email for server-side authentication
- `PB_SUPERUSER_PASSWORD`: PocketBase superuser password for server-side authentication
- `PORT`: server port, defaults to `3000`

## Prerequisites

Before running the app, install:

- Node.js 18+
- npm
- Bun
- Rust toolchain (`rustc`, `cargo`)
- Android Studio / Android SDK for Android builds

## Installation

Install project dependencies:

```bash
npm install
```

Install Bun if it is not already available:

```bash
npm install -g bun
```

Verify Bun:

```bash
bun --version
```

## Running the Project

### Frontend development

```bash
npm run dev
```

### Production frontend build

```bash
npm run build
```

### Start the payment server

```bash
PORT=3000 node server/server.js
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

> The Tauri configuration in `src-tauri/tauri.conf.json` runs Bun before development and build commands, so Bun is part of the expected local workflow.

## API Routes

### `POST /api/create-intent`

Creates a PayMongo payment intent.

Example request:

```json
{
  "amount": 250,
  "orderId": "abc123",
  "orderNumber": "#1001"
}
```

### `POST /api/create-qrph-intent`

Creates a QR Ph payment intent and returns the QR image URL for GCash checkout.

### `POST /api/paymongo-webhook`

Receives PayMongo webhook events and marks the related order as paid when payment succeeds.

### `POST /api/cancel-order`

Cancels an unpaid order and restores product stock.

### `GET /health`

Returns a service health status object.

## Scripts

The current scripts in `package.json` are:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "start": "node server/server.js",
  "tauri": "tauri",
  "tauri:android": "tauri android dev",
  "tauri:build": "tauri android build --apk"
}
```

## Testing

No automated test framework or test script is configured in the project at this time. There is currently no `test` script in `package.json`.

## Contributing

Contributions are welcome if you want to improve the ordering flow, payment logic, UI behavior, or Tauri packaging. A typical contribution flow is:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Run the relevant frontend or Tauri build command
5. Submit a pull request with a clear description

## License

No license file was found in the repository, so no explicit project license is currently declared.

## Summary

MusuGo is a full-stack ordering app that combines a frontend storefront, a PocketBase-backed product catalog, a PayMongo payment flow, and a Tauri packaging layer. The codebase is organized around two main concerns: the user-facing ordering experience and the server-side order/payment lifecycle.
