import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page) {
  await expect(
    page.getByRole("button", { name: "▱ Rectangle", exact: true }),
  ).toBeEnabled();
}
async function inspect(page: Page) {
  const button = page.getByRole("button", { name: "Inspect / Export" });
  if (
    (await button.isVisible()) &&
    !(await page.locator(".operation-panel").isVisible())
  )
    await button.click();
}
async function feature(page: Page, name: string) {
  const drawer = page.getByRole("button", { name: "Features", exact: true });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole("button", { name, exact: false }).click();
}
test("creates the bracket through the interface, edits history, exports and recovers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await ready(page);
  await expect(page.locator(".viewport canvas")).toBeVisible();
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText("14,400 mm³");
  await page.getByRole("button", { name: "▱ Rectangle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Upright sketch");
  await page.getByRole("spinbutton", { name: "Plane offset" }).fill("6");
  await page
    .getByRole("spinbutton", { name: "Height", exact: false })
    .fill("6");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Depth" }).fill("34");
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("add");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await page.getByRole("button", { name: "○ Circle", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Center U" }).fill("30");
  await page.getByRole("spinbutton", { name: "Center V" }).fill("25");
  await page.getByRole("button", { name: "Apply circle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("remove");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText("26,338.407 mm³");
  await feature(page, "Rectangle 1");
  await page.getByRole("spinbutton", { name: "Width" }).fill("80");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText("31,138.407 mm³");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("volume")).toHaveText("26,338.407 mm³");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("volume")).toHaveText("31,138.407 mm³");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export STEP" }).click();
  expect((await exported).suggestedFilename()).toMatch(/\.step$/);
  await ready(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project" }).click();
  const saved = await download;
  const path = await saved.path();
  expect(path).toBeTruthy();
  await expect(
    page.getByText("● Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText("31,138.407 mm³");
  await page.locator("input[type=file]").setInputFiles(path!);
  await ready(page);
  await expect(page.getByTestId("volume")).toHaveText("31,138.407 mm³");
  expect(errors).toEqual([]);
});
test("failed operations and malformed opens preserve the committed model", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await page
    .getByRole("button", { name: "Explore a mechanical bracket ↗" })
    .click();
  await ready(page);
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText("26,338.407 mm³");
  await page.getByRole("button", { name: "⌒ Fillet", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Radius" }).fill("1000");
  await page.getByRole("button", { name: "Apply fillet" }).click();
  await ready(page);
  await expect(page.locator(".error[role=alert]")).toContainText("Fillet");
  await page.getByRole("button", { name: "Close operation" }).click();
  await expect(page.getByTestId("volume")).toHaveText("26,338.407 mm³");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.notcad",
    mimeType: "application/zip",
    buffer: Buffer.from("invalid archive"),
  });
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Cannot open project",
  );
  await expect(page.getByTestId("volume")).toHaveText("26,338.407 mm³");
});
test("reports unavailable storage and keeps a downloadable project with imperial input", async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await expect(page.getByText(/Local save failed: Storage full/)).toBeVisible();
  await inspect(page);
  await page
    .getByRole("combobox", { name: "Display units" })
    .selectOption("in");
  await ready(page);
  await feature(page, "Rectangle 1");
  await page.getByRole("spinbutton", { name: "Width" }).fill("1");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await inspect(page);
  await page
    .getByRole("combobox", { name: "Display units" })
    .selectOption("mm");
  await ready(page);
  await expect(page.getByTestId("volume")).toHaveText("6,096 mm³");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.notcad$/);
});
