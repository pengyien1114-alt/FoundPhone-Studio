import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: [
    "transit.spec.ts",
    "runtime.spec.ts",
    "preview.spec.ts",
    "mymy.spec.ts",
    "updates.spec.ts",
  ],
  timeout: 45000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "mobile-chromium",
      testMatch: "transit.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "existing-runtime",
      testMatch: [
        "runtime.spec.ts",
        "preview.spec.ts",
        "mymy.spec.ts",
        "updates.spec.ts",
      ],
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 1000 },
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --config vite.runtime.config.ts --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
