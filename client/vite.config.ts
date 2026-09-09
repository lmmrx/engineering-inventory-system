import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Only precache the app shell (JS/CSS/HTML/icons). API calls go to a
      // different origin (Render) and are deliberately left uncached here —
      // stock counts and alerts must always come from the network, never a
      // stale cache, so there's no runtimeCaching rule for them.
      manifest: {
        name: "Property Inventory",
        short_name: "Inventory",
        description:
          "Multi-hotel inventory, purchase requests, and work orders for Engineering, Housekeeping, Guest Services, and Food & Beverage teams.",
        start_url: "/",
        display: "standalone",
        background_color: "#0d1117",
        theme_color: "#0d1117",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
