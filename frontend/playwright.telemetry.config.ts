import { defineConfig } from "@playwright/test";
import existing from "./playwright.config";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["telemetry.spec.ts", "integration.spec.ts"],
  grepInvert: /live backend:/,
  workers: 1,
  timeout: 60000,
  use: { ...existing.use, baseURL: "http://127.0.0.1:5176" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: "mock" },
  },
});
