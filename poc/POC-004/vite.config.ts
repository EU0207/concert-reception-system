import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Concert Reception POC-004",
        short_name: "POC-004",
        description: "Authentication, authorization, encryption and cleanup proof of concept",
        theme_color: "#153243",
        background_color: "#f7f4ed",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,webmanifest}"],
        navigateFallback: "index.html",
        runtimeCaching: []
      },
      devOptions: { enabled: true }
    })
  ],
  server: { host: "127.0.0.1", port: 4174, strictPort: true },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true }
});
