import { localIconPlugin } from "./scripts/local-icon-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const buildId = process.env.GITHUB_SHA || Date.now().toString(36);
export default defineConfig(({ command }) => ({
  define: { __APP_BUILD__: JSON.stringify(buildId) },
  base: "./",
  optimizeDeps: { entries: ["index.html"] },
  plugins: [
    localIconPlugin(command),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src/runtime",
      filename: "sw.ts",
      injectRegister: false,
      manifest: {
        name: "TransitLoveALD1",
        short_name: "TransitLoveALD1",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,json,txt,png,jpg}"],
        maximumFileSizeToCacheInBytes: 5000000,
      },
    }),
  ],
}));
