import { defineConfig } from "@playwright/test";
import existing from "./playwright.telemetry.config";
export default defineConfig({
  ...existing,
  testMatch: ["motion.spec.ts", "experience.spec.ts", "telemetry.spec.ts", "integration.spec.ts"],
});
