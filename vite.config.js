import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],

  clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
        host: host || false,
        hmr: host ? {
            protocol: "ws",
            host: host,
            port: 1421
        }: undefined,
        watch: {
            ignored: ["**/src-tauri/**"]
        }

    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
        target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
        minify: !process.env.TAURI_ENV_DEBUG,
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                orderStatus: resolve(__dirname, "order-status.html"),
            },
        },
    }
});