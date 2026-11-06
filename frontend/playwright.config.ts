import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const cache = path.join(os.homedir(), "AppData/Local/ms-playwright");
const cached =
  process.platform === "win32" && fs.existsSync(cache)
    ? fs
        .readdirSync(cache)
        .filter((n) => /^chromium-/.test(n))
        .sort()
        .at(-1)
    : undefined;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (cached ? path.join(cache, cached, "chrome-win64/chrome.exe") : undefined);
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5176",
    launchOptions: { executablePath },
    trace: "retain-on-failure",
    // Existing workflow regressions exercise the previous, subtle presentation.
    // First-visit/cinematic checks explicitly use empty storage in experience.spec.
    storageState: { cookies: [], origins: ["http://127.0.0.1:5176", "http://127.0.0.1:5177"].map(origin => ({
      origin, localStorage: [{ name: "clyra-experience", value: "current" }, { name: "clyra-motion", value: "on" }],
    })) },
  },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort",
      url: "http://127.0.0.1:5176",
      reuseExistingServer: true,
      env: { VITE_API_BASE_URL: "mock" },
    },
    {
      command: "node scripts/serve-live.mjs",
      url: "http://127.0.0.1:5177",
      reuseExistingServer: true,
    },
  ],
});
