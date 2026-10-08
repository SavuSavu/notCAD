import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeProject, decodeProject } from "../../src/storage/project";
import { bracketDocument } from "../../src/model/document";
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
async function tree(page: Page) {
  const button = page.getByRole("button", { name: "Features", exact: true });
  if (
    (await button.isVisible()) &&
    !(await page.locator(".feature-tree").isVisible())
  )
    await button.click();
}
async function edit(page: Page, name: string) {
  await tree(page);
  await page
    .locator(".features")
    .getByRole("button", { name, exact: false })
    .click();
}
async function example(page: Page) {
  await page.goto("./");
  await ready(page);
  await page
    .getByRole("button", { name: "Explore a mechanical bracket ↗" })
    .click();
  await ready(page);
}
async function volume(page: Page, expected: string) {
  await inspect(page);
  await expect(page.getByTestId("volume")).toHaveText(expected);
}
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

test("edits the maximum allowed dimension in inches without rounding beyond the input limit", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  const doc = bracketDocument();
  doc.units = "in";
  doc.features = doc.features.slice(0, 2);
  const sketch = doc.features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "rectangle")
    throw new Error("Invalid fixture");
  sketch.profile.width = 10000;
  await page.locator("input[type=file]").setInputFiles({
    name: "maximum.notcad",
    mimeType: "application/zip",
    buffer: Buffer.from(encodeProject(doc)),
  });
  await ready(page);
  await edit(page, sketch.name);
  const width = page.getByRole("spinbutton", { name: "Width" });
  expect(
    await width.evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(true);
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  const project = decodeProject(
    new Uint8Array(await readFile((await (await downloaded).path())!)),
  );
  expect(project.features[0]).toMatchObject({ profile: { width: 10000 } });
});

test("revolves and edits a turned component, creates multiple parts and exports actual STL", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Turned profile");
  await page.getByRole("combobox", { name: "Sketch plane" }).selectOption("XZ");
  await page.getByRole("spinbutton", { name: "Origin U" }).fill("10");
  await page.getByRole("spinbutton", { name: "Width" }).fill("5");
  await page.getByRole("spinbutton", { name: "Height" }).fill("20");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "⟳ Revolve", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Turned solid");
  await page.getByRole("button", { name: "Apply revolve" }).click();
  await ready(page);
  await volume(page, "7,853.982 mm³");
  await edit(page, "Turned solid");
  await page.getByRole("spinbutton", { name: "Angle" }).fill("180");
  await page.getByRole("button", { name: "Apply revolve" }).click();
  await ready(page);
  await volume(page, "3,926.991 mm³");
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Second solid");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await expect(page.locator(".parts-heading span")).toHaveText("2");
  await volume(page, "4,526.991 mm³");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export STL", exact: true }).click();
  const file = await exported;
  expect(file.suggestedFilename()).toMatch(/\.stl$/);
  const stl = await readFile((await file.path())!, "utf8");
  expect(stl).toMatch(/facet normal/);
  expect(stl).toMatch(/vertex/);
  await ready(page);
});

test("applies fillet and chamfer, suppresses, deletes, reorders, rolls back and restores snapshots", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await page.getByRole("button", { name: "⌒ Fillet", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Edge finish");
  await page.getByRole("button", { name: "Apply fillet" }).click();
  await ready(page);
  await inspect(page);
  expect(
    Number(
      (await page.getByTestId("volume").innerText())
        .split(" ")[0]
        .replaceAll(",", ""),
    ),
  ).toBeLessThan(14400);
  await edit(page, "Edge finish");
  await page
    .getByRole("button", { name: "Suppress feature", exact: true })
    .click();
  await ready(page);
  await volume(page, "14,400 mm³");
  await edit(page, "Edge finish");
  await page
    .getByRole("button", { name: "Unsuppress feature", exact: true })
    .click();
  await ready(page);
  await edit(page, "Edge finish");
  await page
    .getByRole("button", { name: "Delete feature", exact: true })
    .click();
  await ready(page);
  await volume(page, "14,400 mm³");
  await page.getByRole("button", { name: "◩ Chamfer", exact: true }).click();
  await page.getByRole("button", { name: "Apply chamfer" }).click();
  await ready(page);
  await inspect(page);
  expect(
    Number(
      (await page.getByTestId("volume").innerText())
        .split(" ")[0]
        .replaceAll(",", ""),
    ),
  ).toBeLessThan(14400);
  await tree(page);
  await page
    .getByRole("combobox", { name: "History position" })
    .selectOption("2");
  await ready(page);
  await volume(page, "14,400 mm³");
  await tree(page);
  await page
    .getByRole("combobox", { name: "History position" })
    .selectOption("3");
  await ready(page);
  await edit(page, "Extrude 2");
  await page.getByRole("button", { name: "Move earlier", exact: true }).click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "forward sketch",
  );
  await page
    .getByRole("button", { name: "Delete feature", exact: true })
    .click();
  await expect(page.locator(".error[role=alert]")).toContainText("dependent");
  await page
    .getByRole("button", { name: "Close operation", exact: true })
    .click();
  // Add an independent sketch and move it ahead of the finishing operation.
  await page.getByRole("button", { name: "○ Circle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Independent sketch");
  await page.getByRole("button", { name: "Apply circle" }).click();
  await ready(page);
  await edit(page, "Independent sketch");
  await page.getByRole("button", { name: "Move earlier", exact: true }).click();
  await ready(page);
  await tree(page);
  await expect(page.locator(".features .feature").nth(2)).toContainText(
    "Independent sketch",
  );
  await inspect(page);
  await page
    .getByRole("combobox", { name: "Display units" })
    .selectOption("in");
  await ready(page);
  await expect(
    page.getByText("● Saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore previous snapshot", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByRole("combobox", { name: "Display units" }),
  ).toHaveValue("mm");
});

test("intersects parts, renames projects, uses keyboard history, and keeps requests local", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4173")
      external.push(request.url());
  });
  await example(page);
  await edit(page, "Mounting hole · cut");
  await page.getByRole("button", { name: "Suppress feature" }).click();
  await ready(page);
  await volume(page, "26,640 mm³");
  await page.keyboard.press("Control+z");
  await ready(page);
  await volume(page, "26,338.407 mm³");
  await page.keyboard.press("Control+Shift+z");
  await ready(page);
  await volume(page, "26,640 mm³");
  await page.getByRole("button", { name: "▱ Rectangle", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Origin U" }).fill("30");
  await page.getByRole("spinbutton", { name: "Height" }).fill("40");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("intersect");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await volume(page, "7,200 mm³");
  const name = page.getByRole("textbox", { name: "Project name", exact: true });
  await expect(name).toBeVisible();
  await name.fill("Intersection model");
  await name.press("Tab");
  await ready(page);
  await expect(name).toHaveValue("Intersection model");
  await name.fill("   ");
  await name.press("Tab");
  await expect(name).toHaveValue("Intersection model");
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await downloaded).suggestedFilename()).toMatch(/\.notcad$/);
  expect(external).toEqual([]);
});

test("opens a project away from the origin and fits it for viewport selection", async ({
  page,
}) => {
  await example(page);
  const doc = bracketDocument();
  doc.id = "distant-project";
  doc.name = "Distant box";
  doc.features = doc.features.slice(0, 2);
  const sketch = doc.features[0];
  if (sketch.type === "sketch") sketch.profile.x = 9000;
  await page.locator("input[type=file]").setInputFiles({
    name: "distant.notcad",
    mimeType: "application/zip",
    buffer: Buffer.from(encodeProject(doc)),
  });
  await ready(page);
  const canvas = page.locator(".viewport canvas");
  const box = await canvas.boundingBox();
  const position = { x: box!.width / 2, y: box!.height / 2 };
  if (test.info().project.use.hasTouch) await canvas.tap({ position });
  else await canvas.click({ position });
  await expect(page.locator(".part.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
});
test("models and displays the minimum accepted dimensions without rounding volume to zero", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  await page.getByRole("button", { name: "Create a rectangle sketch" }).click();
  await page.getByRole("spinbutton", { name: "Width" }).fill("0.001");
  await page.getByRole("spinbutton", { name: "Height" }).fill("0.001");
  await page.getByRole("button", { name: "Apply rectangle" }).click();
  await ready(page);
  await page.getByRole("button", { name: "↗ Extrude", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Depth" }).fill("0.001");
  await page.getByRole("button", { name: "Apply extrude" }).click();
  await ready(page);
  await volume(page, "0.000000001 mm³");
  await expect(page.locator(".error[role=alert]")).toHaveCount(0);
});
test("retains a suppressed sketch reference instead of silently choosing another profile", async ({
  page,
}) => {
  await page.goto("./");
  await ready(page);
  const doc = bracketDocument();
  doc.features = doc.features.slice(0, 2);
  const sketch = doc.features[0],
    extrude = doc.features[1];
  if (sketch.type !== "sketch" || extrude.type !== "extrude")
    throw new Error("Invalid fixture");
  sketch.suppressed = true;
  extrude.suppressed = true;
  doc.features.push({
    ...sketch,
    id: "other-profile",
    name: "Other profile",
    suppressed: false,
    profile: { kind: "rectangle", x: 100, y: 0, width: 10, height: 10 },
  });
  doc.features.push({
    ...extrude,
    id: "other-part",
    name: "Other part",
    sketchId: "other-profile",
    suppressed: false,
    depth: 2,
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "suppressed.notcad",
    mimeType: "application/zip",
    buffer: Buffer.from(encodeProject(doc)),
  });
  await ready(page);
  await edit(page, "Base · 6 mm");
  await expect(
    page.getByRole("combobox", { name: "Profile", exact: true }),
  ).toHaveValue("base-sketch");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Suppressed extrusion");
  await page
    .getByRole("button", { name: "Apply extrude", exact: true })
    .click();
  await ready(page);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  const bytes = await readFile((await (await downloaded).path())!);
  const project = decodeProject(new Uint8Array(bytes));
  expect(
    project.features.find((feature) => feature.id === "base"),
  ).toMatchObject({
    type: "extrude",
    sketchId: "base-sketch",
    suppressed: true,
  });
  await edit(page, "Suppressed extrusion");
  await page
    .getByRole("button", { name: "Unsuppress feature", exact: true })
    .click();
  await ready(page);
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Required sketch is suppressed",
  );
});
