import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "calculos", testMatch: ["finance.spec.ts", "auth-utils.spec.ts"] },
    { name: "desktop", testMatch: ["app.spec.ts", "auth.spec.ts"], use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 1000 } } },
    { name: "celular", testMatch: ["app.spec.ts", "auth.spec.ts"], use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "chrome" } },
  ],
  webServer: process.argv.includes("--project=calculos") ? undefined : {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
