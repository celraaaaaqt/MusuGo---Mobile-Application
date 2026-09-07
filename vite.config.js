import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],

  clearScreen: false,

  server: {
    host: host || false,
    port: 1420,
    strictPort: true,

    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,

    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});