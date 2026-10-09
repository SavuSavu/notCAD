import { beforeAll, afterEach, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setOC } from "replicad";
import {
  init_planegcs_module,
  type ModuleStatic,
  type SketchPrimitive,
} from "@salusoft89/planegcs";
import { GeometryEngine, inspectStep } from "../src/kernel/engine";
import {
  bracketDocument,
  emptyDocument,
  type CadDocument,
} from "../src/core/model";
import { solvePrimitives } from "../src/kernel/solver";

let solver: ModuleStatic;
const engines: GeometryEngine[] = [];
const engine = () => {
  const e = new GeometryEngine(solver);
  engines.push(e);
  return e;
};
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const initOC = require("replicad-opencascadejs");
  setOC(
    await initOC({
      wasmBinary: await readFile(
        require.resolve("replicad-opencascadejs/wasm"),
      ),
    }),
  );
  solver = await init_planegcs_module({
    wasmBinary: await readFile(
      "node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
    ),
  });
});
afterEach(() => {
  engines.splice(0).forEach((e) => e.dispose());
});
export function boxDocument(): CadDocument {
  const doc = bracketDocument();
  doc.features = doc.features.slice(0, 2);
  return doc;
}
describe("exact geometry", () => {
  test.each(["XY", "XZ", "YZ"] as const)(
    "extrusion extents preserve signed bounds on the %s plane",
    (plane) => {
      const e = engine();
      for (const distance of [6, -6]) {
        for (const extent of [
          undefined,
          "one-sided",
          "symmetric",
          "two-sided",
        ] as const) {
          const doc = boxDocument();
          const profile = doc.features[0];
          const feature = doc.features[1];
          if (profile.type !== "sketch" || feature.type !== "extrude")
            throw new Error("Invalid fixture");
          profile.plane = plane;
          profile.offset = 12;
          feature.distance = distance;
          feature.extent = extent;
          feature.secondDistance = extent === "two-sided" ? 4 : undefined;
          const part = e.regenerate(doc).parts[0];
          const start =
            extent === "symmetric"
              ? -distance / 2
              : extent === "two-sided"
                ? -Math.sign(distance) * 4
                : 0;
          const end = extent === "symmetric" ? distance / 2 : distance;
          const normalSign = plane === "XZ" ? -1 : 1;
          const axis = plane === "XY" ? 2 : plane === "XZ" ? 1 : 0;
          const ends = [(12 + start) * normalSign, (12 + end) * normalSign];
          expect(part.bounds[0][axis]).toBeCloseTo(Math.min(...ends), 5);
          expect(part.bounds[1][axis]).toBeCloseTo(Math.max(...ends), 5);
          expect(part.volume).toBeCloseTo(
            60 * 40 * (extent === "two-sided" ? 10 : 6),
            5,
          );
          expect(part.faces).toBe(6);
          expect(part.solids).toBe(1);
          expect(part.valid).toBe(true);
        }
      }
    },
  );
  test.each(["add", "remove", "intersect"] as const)(
    "two-direction circular extrusion supports %s and upstream edits",
    (mode) => {
      const e = engine();
      const doc = boxDocument();
      doc.features.push(
        {
          id: "circle",
          name: "Circle",
          suppressed: false,
          type: "sketch",
          plane: "XY",
          x: 0,
          y: 0,
          offset: 3,
          profile: { kind: "circle", radius: 5 },
        },
        {
          id: "operation",
          name: "Two directions",
          suppressed: false,
          type: "extrude",
          sketchId: "circle",
          targetId: "base",
          mode,
          distance: 8,
          extent: "two-sided",
          secondDistance: 4,
        },
      );
      for (const radius of [5, 7]) {
        const circle = doc.features[2];
        if (circle.type === "sketch")
          circle.profile = { kind: "circle", radius };
        const part = e.regenerate(doc).parts[0];
        const cylinderOverlap = Math.PI * radius ** 2 * 6;
        expect(part.volume).toBeCloseTo(
          mode === "add"
            ? 14400 + cylinderOverlap
            : mode === "remove"
              ? 14400 - cylinderOverlap
              : cylinderOverlap,
          5,
        );
        expect(part.valid).toBe(true);
        expect(part.solids).toBe(1);
      }
    },
  );
  test("box has analytic volume, surface area, topology, and dimensions", () => {
    const result = engine().regenerate(boxDocument());
    const box = result.parts[0];
    expect(box.valid).toBe(true);
    expect(box.solids).toBe(1);
    expect(box.faces).toBe(6);
    expect(box.volume).toBeCloseTo(60 * 40 * 6, 6);
    expect(box.area).toBeCloseTo(2 * (60 * 40 + 60 * 6 + 40 * 6), 6);
    expect(box.bounds[1][0] - box.bounds[0][0]).toBeCloseTo(60, 5);
    expect(result.sketches["base-profile"].dof).toBe(0);
  });
  test("bracket booleans match analytic volume and reuse unchanged history", () => {
    const e = engine(),
      doc = bracketDocument();
    expect(e.regenerate(doc).parts[0].volume).toBeCloseTo(
      60 * 40 * 6 + 60 * 6 * 34 - Math.PI * 25 * 6,
      5,
    );
    expect(e.regenerate({ ...doc, revision: 1 }).regenerated).toBe(0);
    const last = doc.features.at(-1)!;
    if (last.type === "extrude") last.distance = 3;
    const result = e.regenerate(doc);
    expect(result.regenerated).toBe(1);
    expect(result.parts[0].volume).toBeCloseTo(
      60 * 40 * 6 + 60 * 6 * 34 - Math.PI * 25 * 3,
      5,
    );
  });
  test("failed operations preserve exportable committed geometry", async () => {
    const e = engine(),
      doc = boxDocument();
    e.regenerate(doc);
    doc.features.push({
      id: "bad",
      name: "Impossible fillet",
      suppressed: false,
      type: "fillet",
      targetId: "base",
      radius: 500,
    });
    expect(() => e.regenerate(doc)).toThrow();
    const part = await inspectStep(
      new Uint8Array(await e.export("step").arrayBuffer()),
    );
    expect(part.volume).toBeCloseTo(14400, 5);
  });
  test("STEP round trip preserves volume, bounds, and topology", async () => {
    const e = engine(),
      expected = e.regenerate(bracketDocument()).parts[0];
    const read = await inspectStep(
      new Uint8Array(await e.export("step").arrayBuffer()),
    );
    expect(read.volume).toBeCloseTo(expected.volume, 5);
    expect(read.faces).toBe(expected.faces);
    expect(read.valid).toBe(true);
  });
  test("binary STL is independently readable and approximates analytic volume", async () => {
    const e = engine();
    e.regenerate(boxDocument());
    const data = new DataView(await e.export("stl").arrayBuffer());
    const count = data.getUint32(80, true);
    expect(count).toBe(12);
    expect(data.byteLength).toBe(84 + 50 * count);
    let volume = 0;
    for (let i = 0; i < count; i++) {
      const at = 84 + 50 * i + 12;
      const p = Array.from({ length: 9 }, (_, j) =>
        data.getFloat32(at + 4 * j, true),
      );
      volume +=
        (p[0] * (p[4] * p[8] - p[5] * p[7]) +
          p[1] * (p[5] * p[6] - p[3] * p[8]) +
          p[2] * (p[3] * p[7] - p[4] * p[6])) /
        6;
    }
    expect(volume).toBeCloseTo(14400, 3);
  });
  test("revolve, fillet, chamfer, rollback, suppression and empty regeneration", () => {
    const e = engine(),
      doc = boxDocument();
    const sketch = doc.features[0];
    if (sketch.type === "sketch") {
      sketch.plane = "XZ";
      sketch.x = 20;
      sketch.profile = { kind: "rectangle", width: 10, height: 20 };
    }
    doc.features[1] = {
      id: "base",
      name: "Turn",
      suppressed: false,
      type: "revolve",
      sketchId: "base-profile",
      mode: "new",
      axis: "Z",
      angle: 360,
    };
    expect(e.regenerate(doc).parts[0].volume).toBeCloseTo(
      Math.PI * (25 ** 2 - 15 ** 2) * 20,
      5,
    );
    for (const type of ["fillet", "chamfer"] as const) {
      const box = boxDocument();
      box.features.push({
        id: "finish",
        name: type,
        suppressed: false,
        type,
        targetId: "base",
        radius: 1,
      });
      const rounded = e.regenerate(box).parts[0];
      expect(rounded.volume).toBeLessThan(14400);
      expect(rounded.valid).toBe(true);
      box.features[2].suppressed = true;
      expect(e.regenerate(box).parts[0].volume).toBeCloseTo(14400, 5);
      box.rollback = 1;
      expect(e.regenerate(box).parts).toHaveLength(0);
    }
    expect(e.regenerate(emptyDocument()).parts).toHaveLength(0);
  });
  test("repeated regeneration and disposal keeps returning valid results", () => {
    for (let i = 0; i < 30; i++) {
      const e = engine();
      expect(e.regenerate(boxDocument()).parts[0].valid).toBe(true);
      e.dispose();
    }
  });
});
describe("PlaneGCS diagnostics", () => {
  const points: SketchPrimitive[] = [
    { id: "1", type: "point", x: 0, y: 0, fixed: true },
    { id: "2", type: "point", x: 10, y: 4, fixed: false },
  ];
  test("underconstrained and satisfied systems report actual DOF", () => {
    expect(solvePrimitives(solver, points).dof).toBe(2);
    const result = solvePrimitives(solver, [
      ...points,
      { id: "3", type: "coordinate_x", p_id: "2", x: 20 },
      { id: "4", type: "coordinate_y", p_id: "2", y: 0 },
    ]);
    expect(result.status).toBe("satisfied");
    expect(result.dof).toBe(0);
    expect(result.primitives[1]).toMatchObject({ x: 20, y: 0 });
  });
  test("conflicting and redundant dimensions are diagnosed", () => {
    const dims: SketchPrimitive[] = [
      ...points,
      { id: "3", type: "coordinate_x", p_id: "2", x: 20 },
      { id: "4", type: "coordinate_x", p_id: "2", x: 30 },
    ];
    expect(solvePrimitives(solver, dims).status).toBe("inconsistent");
    dims[3] = { id: "4", type: "coordinate_x", p_id: "2", x: 20 };
    expect(solvePrimitives(solver, dims).status).toBe("redundant");
  });
});
