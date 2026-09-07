import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  publicDir: "generated-assets",
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Concert Reception POC-005",
        short_name: "POC-005",
        description: "Offline seat map and venue image proof of concept",
        theme_color: "#173b40",
        background_color: "#f7f3e8",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      },
      workbox: {
        cacheId: "concert-reception-poc-005-shell",
        globPatterns: ["**/*.{html,js,css,svg,webmanifest}"],
        globIgnores: ["venue-images/**"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: []
      },
      devOptions: { enabled: true }
    })
  ],
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true }
});
