import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/notCAD/",
    trace: "retain-on-failure",
    headless: process.env.NOTCAD_HEADED !== "1",
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/notCAD/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "webgl.force-enabled": true,
            "gfx.webrender.software": true,
            "webgl.out-of-process": false,
          },
        },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "touch",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
