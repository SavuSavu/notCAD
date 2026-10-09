import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodeProject } from "../../src/core/project";

async function ready(page: Page) {
  await expect(
    page.getByRole("button", { name: "Sketch", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator('canvas[aria-label="CAD model viewport"]'),
  ).toBeVisible();
  await expect(page.locator(".viewport-error")).toHaveCount(0);
}
async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply feature" }).click();
  await expect(
    page.getByRole("complementary", { name: "Feature editor" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
}
async function history(page: Page) {
  const toggle = page.getByRole("button", { name: "☰ History" });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  )
    await toggle.click();
}
async function closeHistory(page: Page) {
  const close = page.getByRole("button", {
    name: "Close history",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
}
async function sketch(
  page: Page,
  name: string,
  width: number,
  height: number,
  y = 0,
  offset = 0,
) {
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Width", { exact: true }).fill(String(width));
  await page.getByLabel("Height", { exact: true }).fill(String(height));
  await page.getByLabel("Center Y", { exact: true }).fill(String(y));
  await page.getByLabel("Plane offset", { exact: true }).fill(String(offset));
  await apply(page);
}
async function extrude(
  page: Page,
  name: string,
  distance: number,
  mode = "new",
) {
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Distance", { exact: true }).fill(String(distance));
  await page.getByLabel("Operation", { exact: true }).selectOption(mode);
  await apply(page);
}
test("build dimension-driven bracket through the interface; edit, save, reload and export", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const remote: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("data:")
    )
      remote.push(r.url());
  });
  await page.goto("./");
  await ready(page);
  await sketch(page, "Base profile", 60, 40);
  await extrude(page, "Base plate", 6);
  await sketch(page, "Upright profile", 60, 6, 17, 6);
  await extrude(page, "Upright", 34, "add");
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mounting hole");
  await page.getByRole("button", { name: "○ Circle" }).click();
  await page.getByLabel("Radius", { exact: true }).fill("5");
  await page.getByLabel("Center Y", { exact: true }).fill("-3");
  await apply(page);
  await extrude(page, "Through hole", 6, "remove");
  await history(page);
  await page.getByRole("button", { name: /02.*Base plate/ }).click();
  await closeHistory(page);
  await expect(page.getByTestId("volume")).toHaveText("26,168.761 mm³");
  await page.screenshot({ path: testInfo.outputPath("bracket.png") });
  await history(page);
  await page.getByRole("button", { name: /01.*Base profile/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("80");
  await apply(page);
  await history(page);
  await page.getByRole("button", { name: /02.*Base plate/ }).click();
  await closeHistory(page);
  await expect(page.getByTestId("volume")).toHaveText("30,968.761 mm³");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("volume")).toHaveText("26,168.761 mm³");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("volume")).toHaveText("30,968.761 mm³");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await ready(page);
  await history(page);
  await expect(
    page.getByRole("button", { name: /06.*Through hole/ }),
  ).toBeVisible();
  await closeHistory(page);
  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Save project|↓/ }).click();
  const project = await projectDownload;
  expect(project.suggestedFilename()).toMatch(/\.notcad$/);
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  const stepDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "STEP · exact solids" }).click();
  expect((await stepDownload).suggestedFilename()).toMatch(/\.step$/);
  await page
    .getByRole("button", { name: "Export", exact: false })
    .first()
    .click();
  const stlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "STL · triangle mesh" }).click();
  expect((await stlDownload).suggestedFilename()).toMatch(/\.stl$/);
  await ready(page);
  await page.getByRole("button", { name: "＋ New project" }).click();
  await expect(
    page.getByRole("heading", { name: /From a thought/ }),
  ).toBeVisible();
  await page
    .getByLabel("Open notCAD project")
    .setInputFiles((await project.path())!);
  await ready(page);
  await history(page);
  await expect(
    page.getByRole("button", { name: /06.*Through hole/ }),
  ).toBeVisible();
  await closeHistory(page);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("symmetric and two-direction extrusions preview, edit, convert units and reopen", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await sketch(page, "Extent profile", 60, 40);
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Centered solid");
  await page.getByLabel("Extrusion extent").selectOption("symmetric");
  await page.getByLabel("Total distance", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("PREVIEW · Apply to keep")).toBeVisible();
  await apply(page);
  await history(page);
  await page.getByRole("button", { name: /02.*Centered solid/ }).click();
  await closeHistory(page);
  await expect(page.getByTestId("volume")).toHaveText("14,400 mm³");

  await history(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Extrusion extent")).toHaveValue("symmetric");
  await page.getByLabel("Extrusion extent").selectOption("two-sided");
  await page.getByLabel("Distance", { exact: true }).fill("-6");
  await page.getByLabel("Second distance", { exact: true }).fill("4");
  await apply(page);
  await expect(page.getByTestId("volume")).toHaveText("24,000 mm³");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("volume")).toHaveText("14,400 mm³");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("volume")).toHaveText("24,000 mm³");

  await page.getByLabel("Document units").selectOption("in");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await history(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Distance", { exact: true }).fill("-0.5");
  await page.getByLabel("Second distance", { exact: true }).fill("0.25");
  await apply(page);
  await page.getByLabel("Document units").selectOption("mm");
  await expect(page.getByTestId("volume")).toHaveText("45,720 mm³");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await ready(page);
  await history(page);
  await page.getByRole("button", { name: /02.*Centered solid/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Extrusion extent")).toHaveValue("two-sided");
  await expect(page.getByLabel("Distance", { exact: true })).toHaveValue(
    "-12.7",
  );
  await expect(page.getByLabel("Second distance", { exact: true })).toHaveValue(
    "6.35",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Save project|↓/ }).click();
  const path = (await (await download).path())!;
  const document = decodeProject(new Uint8Array(await readFile(path)));
  expect(document.features[1]).toMatchObject({
    extent: "two-sided",
    distance: -12.7,
    secondDistance: 6.35,
  });
  await page.getByRole("button", { name: "＋ New project" }).click();
  await expect(
    page.getByRole("heading", { name: /From a thought/ }),
  ).toBeVisible();
  await page.getByLabel("Open notCAD project").setInputFiles(path);
  await ready(page);
  await history(page);
  await page.getByRole("button", { name: /02.*Centered solid/ }).click();
  await closeHistory(page);
  await expect(page.getByTestId("volume")).toHaveText("45,720 mm³");
  await history(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Extrusion extent").selectOption("one-sided");
  await expect(page.getByLabel("Second distance", { exact: true })).toHaveCount(
    0,
  );
  await apply(page);
  await expect(page.getByTestId("volume")).toHaveText("30,480 mm³");
});

test("preview is disposable and a failed feature preserves the committed document", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await sketch(page, "Block", 60, 40);
  await extrude(page, "Solid", 6);
  await page.getByRole("button", { name: "Fillet", exact: true }).click();
  await page.getByLabel("Radius", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("PREVIEW · Apply to keep")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("PREVIEW · Apply to keep")).toHaveCount(0);
  await page.getByRole("button", { name: "Fillet", exact: true }).click();
  await page.getByLabel("Radius", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Apply feature" }).click();
  await expect(page.getByRole("alert")).toContainText("Fillet");
  await page.getByRole("button", { name: "Restart geometry" }).click();
  await ready(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await history(page);
  await page.getByRole("button", { name: /02.*Solid/ }).click();
  await closeHistory(page);
  await expect(page.getByTestId("volume")).toHaveText("14,400 mm³");
  await page.getByLabel("Document units").selectOption("in");
  await expect(page.getByTestId("volume")).toContainText("in³");
  await page.getByLabel("Document units").selectOption("mm");
  await expect(page.getByTestId("volume")).toHaveText("14,400 mm³");
});

test("malformed files and storage exhaustion preserve a downloadable recovery project", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === "workspace" &&
        sessionStorage.getItem("simulate-quota") === "yes"
      )
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("./");
  await ready(page);
  await sketch(page, "Recovery profile", 30, 20);
  await page.getByLabel("Open notCAD project").setInputFiles({
    name: "broken.notcad",
    mimeType: "application/zip",
    buffer: Buffer.from("broken archive"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.evaluate(() => sessionStorage.setItem("simulate-quota", "yes"));
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByRole("button", { name: "Apply feature" }).click();
  await expect(page.getByTestId("save-status")).toContainText(
    "Autosave failed",
  );
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recovery copy" }).click();
  const path = await (await file).path();
  const document = decodeProject(new Uint8Array(await readFile(path!)));
  expect(document.features).toHaveLength(2);
  expect(document.features[0].name).toBe("Recovery profile");
  await page.evaluate(() => sessionStorage.removeItem("simulate-quota"));
  await page.reload();
  await ready(page);
  await history(page);
  await expect(
    page.getByRole("button", { name: /01.*Recovery profile/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /02.*Extrude/ })).toHaveCount(
    0,
  );
});

test("touch selects an exact body and edits its feature using the history drawer", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(
    !isMobile,
    "Touch workflow only runs in mobile profiles; physical device gate is separate.",
  );
  await page.goto("./");
  await ready(page);
  await page
    .getByRole("button", { name: "Explore the mounting bracket ↗" })
    .tap();
  await ready(page);
  const canvas = page.locator('canvas[aria-label="CAD model viewport"]');
  const bounds = (await canvas.boundingBox())!;
  await page.touchscreen.tap(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await expect(page.getByTestId("volume")).toContainText("26,168.761");
  await page.getByRole("button", { name: "☰ History" }).tap();
  await page.getByRole("button", { name: /01.*Base profile/ }).tap();
  await page.getByRole("button", { name: "Edit", exact: true }).tap();
  await page.getByLabel("Width", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Apply feature" }).tap();
  await ready(page);
  await page.getByRole("button", { name: "☰ History" }).tap();
  await page.getByRole("button", { name: /02.*Base plate/ }).tap();
  await page.getByRole("button", { name: "Close history", exact: true }).tap();
  await expect(page.getByTestId("volume")).toContainText("29,768.761");
  await page.screenshot({ path: testInfo.outputPath("touch-bracket.png") });
});
