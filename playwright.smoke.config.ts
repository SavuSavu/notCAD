import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 180000,
  expect: { timeout: 90000 },
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/pages-smoke.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL:
      process.env.NOTCAD_SMOKE_URL ?? "https://savusavu.github.io/notCAD/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
