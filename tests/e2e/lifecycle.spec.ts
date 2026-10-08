import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodeProject } from "../../src/storage/project";
const ready = (page: Page) =>
  expect(
    page.getByRole("button", { name: "▱ Rectangle", exact: true }),
  ).toBeEnabled();
test("keeps the recovered document downloadable if worker loading is cancelled", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await page
    .getByRole("button", { name: "Explore a mechanical bracket ↗" })
    .click();
  await ready(page);
  await expect(
    page.getByText("● Saved on this device", { exact: true }),
  ).toBeVisible();
  const held: Route[] = [];
  await page.route("**/*.wasm", (route) => {
    held.push(route);
  });
  await page.reload();
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await page.locator(".working button").click();
  await ready(page);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project" }).click();
  const file = await downloaded;
  const project = decodeProject(
    new Uint8Array(await readFile((await file.path())!)),
  );
  expect(project.name).toBe("Mechanical bracket");
  expect(project.features).toHaveLength(6);
  await page.unroute("**/*.wasm");
  for (const route of held) await route.continue().catch(() => {});
  await page.getByRole("button", { name: "○ Circle", exact: true }).click();
  await page.getByRole("button", { name: "Apply circle" }).click();
  await ready(page);
  await expect(page.locator(".parts-heading span")).toHaveText("1");
});
test("form cancellation aborts a pending operation and prevents its late commit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage as (
      message: any,
      options?: StructuredSerializeOptions | Transferable[],
    ) => void;
    Worker.prototype.postMessage = function (
      ...args: [
        message: any,
        options?: StructuredSerializeOptions | Transferable[],
      ]
    ) {
      if (Reflect.get(window, "delayCad") && args[0]?.type === "regenerate")
        setTimeout(() => send.apply(this, args), 1200);
      else send.apply(this, args);
    };
  });
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.evaluate(() => Reflect.set(window, "delayCad", true));
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await expect(page.locator(".working")).toBeVisible();
  await page
    .locator(".operation-panel form")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await ready(page);
  await page.waitForTimeout(1600);
  await expect(page.locator(".parts-heading span")).toHaveText("0");
  await expect(page.locator(".features .feature")).toHaveCount(1);
});
test("waits for recovery data before export and supports save/cancel while an input is focused", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      const request = open.call(this, name, version);
      request.addEventListener(
        "success",
        (event) => {
          event.stopImmediatePropagation();
          setTimeout(() => request.onsuccess?.call(request, event), 750);
        },
        { once: true },
      );
      return request;
    };
  });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Download project", exact: true }),
  ).toBeDisabled();
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("spinbutton", { name: "Width" }).fill("42");
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const file = await downloaded;
  expect(
    decodeProject(new Uint8Array(await readFile((await file.path())!)))
      .features,
  ).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".operation-panel form")).toHaveCount(0);
});
