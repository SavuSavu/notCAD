import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodeProject } from "../../src/storage/project";

test("serves the tested artifact and supports modeling, project recovery and geometry exports", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  const wasm: { url: string; status: number; type: string }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().endsWith(".wasm"))
      wasm.push({
        url: response.url(),
        status: response.status(),
        type: response.headers()["content-type"] ?? "",
      });
  });
  // Waiting for the expected entry asset prevents checking a cached previous deployment.
  const artifact = await readFile("dist/index.html", "utf8");
  const entry = artifact.match(/src="([^"]+\.js)"/)?.[1];
  expect(entry, "Build dist before running the live smoke test").toBeTruthy();
  await expect
    .poll(
      async () => {
        const response = await request.get("./", {
          headers: { "Cache-Control": "no-cache" },
        });
        return response.ok() && (await response.text()).includes(entry!);
      },
      { timeout: 120000, intervals: [1000, 3000, 5000] },
    )
    .toBe(true);
  const ready = () =>
    expect(
      page.getByRole("button", { name: "▱ Rectangle", exact: true }),
    ).toBeEnabled();
  await page.goto("./");
  await ready();
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("spinbutton", { name: "Width" }).fill("10");
  await page.getByRole("spinbutton", { name: "Height" }).fill("20");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready();
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Depth" }).fill("3");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready();
  await expect(page.getByTestId("volume")).toHaveText("600 mm³");
  for (const [name, signature] of [
    ["Export STEP", "ISO-10303-21"],
    ["Export STL", "solid"],
  ]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name }).click();
    expect(
      await readFile((await (await downloaded).path())!, "utf8"),
    ).toContain(signature);
    await ready();
  }
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  const saved = (await (await downloaded).path())!;
  const document = decodeProject(new Uint8Array(await readFile(saved)));
  expect(document.features).toHaveLength(2);
  await expect(
    page.getByText("● Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready();
  await expect(page.getByTestId("volume")).toHaveText("600 mm³");
  await page.locator("input[type=file]").setInputFiles(saved);
  await ready();
  await expect(page.getByTestId("volume")).toHaveText("600 mm³");
  expect(new Set(wasm.map((response) => response.url)).size).toBe(2);
  expect(
    wasm.every(
      (response) =>
        response.status === 200 && response.type.includes("application/wasm"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach("live-workspace", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await testInfo.attach("WASM-responses", {
    body: JSON.stringify(wasm),
    contentType: "application/json",
  });
});
