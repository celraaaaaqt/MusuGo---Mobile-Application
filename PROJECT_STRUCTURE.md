# Musugo App Project Structure

This document gives a quick overview of the project layout and the purpose of each main folder and file.

## Root

- `index.html` – main entry page for the app
- `package.json` – project dependencies and scripts
- `README.md` – setup and usage documentation
- `vite.config.js` – Vite configuration for the frontend
- `src/` – frontend source code
- `src-tauri/` – Tauri desktop/mobile app configuration and Rust backend

## Frontend Source

### `src/`

- `main.js` – main app bootstrapping and UI initialization
- `styles.css` – global styling and theme classes
- `assets/` – images and media assets used throughout the app
  - `heros/` – hero/banner images
  - `menu/` – menu-related images/assets
- `interactivity/` – JavaScript logic for app interactions
  - `cart.js` – cart state, add/remove quantity, localStorage persistence, totals
  - `checkout.js` – checkout modal, payment method selection, order confirmation and success flow
  - `product_category.js` – category filtering for product cards
  - `search_products.js` – product search by name

## Tauri App

### `src-tauri/`

- `Cargo.toml` – Rust project configuration and dependencies
- `build.rs` – build script for Tauri
- `tauri.conf.json` – app metadata, window configuration, and Tauri settings
- `capabilities/` – permissions/capabilities config for app features
- `gen/` – generated Tauri/Android project files
- `icons/` – app icons for different platforms
- `src/`
  - `lib.rs` – Rust library entry point
  - `main.rs` – main Rust application entry point

## Generated Android Structure

The Android build files are generated under `src-tauri/gen/android/`, including:

- `build.gradle.kts` – Android Gradle app config
- `settings.gradle` – settings for the Android project
- `gradlew` and `gradlew.bat` – Gradle wrapper scripts
- `app/` – Android application source and build configuration
- `gradle/` – Gradle wrapper files

## Notes

This project combines:

- a Vite-based frontend in `src/`
- interaction logic in `src/interactivity/`
- a Tauri shell for desktop/mobile packaging in `src-tauri/`

The app appears to be a simple storefront or product ordering app with cart management, category filters, search, checkout, and payment selection.
