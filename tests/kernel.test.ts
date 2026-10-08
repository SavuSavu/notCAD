import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import initOC from "replicad-opencascadejs";
import {
  init_planegcs_module,
  type ModuleStatic,
  type SketchPrimitive,
} from "@salusoft89/planegcs";
import { Engine } from "../src/kernel/engine";
import {
  bracketDocument,
  emptyDocument,
  type Document,
} from "../src/model/document";
import { analyticTolerance } from "../src/kernel/tolerance";
import { solvePrimitives } from "../src/kernel/solver";
let engine: Engine, gcs: ModuleStatic;
beforeAll(async () => {
  const oc = await initOC({
    wasmBinary: fs.readFileSync(
      "node_modules/replicad-opencascadejs/dist/replicad_single.wasm",
    ),
  });
  gcs = await init_planegcs_module({
    wasmBinary: fs.readFileSync(
      "node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
    ),
  });
  engine = new Engine(oc, gcs);
}, 90000);
function block(): Document {
  const doc = bracketDocument();
  return { ...doc, features: doc.features.slice(0, 2) };
}
describe("exact geometry fixtures", () => {
  it("extrudes a valid rectangular solid with analytic volume, area and topology", () => {
    const result = engine.regenerate(block());
    expect(result.parts[0].volume).toBeCloseTo(14400, 6);
    expect(result.parts[0].area).toBeCloseTo(6000, 6);
    expect(result.parts[0].faces).toBe(6);
    expect(result.parts[0].valid).toBe(true);
    expect(result.parts[0].mesh.indices.length).toBe(36);
    expect(result.diagnostics[0].dof).toBe(0);
  });
  it("builds the bracket with fused upright and a cylindrical cut", () => {
    const result = engine.regenerate(bracketDocument());
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].volume).toBeCloseTo(
      60 * 40 * 6 + 60 * 6 * 34 - Math.PI * 4 ** 2 * 6,
      5,
    );
    expect(
      result.diagnostics.every((d) => d.dof === 0 && d.conflicts.length === 0),
    ).toBe(true);
  });
  it("changes an early dimension and regenerates downstream geometry", () => {
    const doc = bracketDocument();
    const sketch = doc.features[0];
    if (sketch.type === "sketch" && sketch.profile.kind === "rectangle")
      sketch.profile.width = 80;
    expect(engine.regenerate(doc).parts[0].volume).toBeCloseTo(
      80 * 40 * 6 + 60 * 6 * 34 - Math.PI * 16 * 6,
      5,
    );
  });
  it("rolls back and rejects suppressed dependencies", () => {
    const doc = bracketDocument();
    expect(
      engine.regenerate({ ...doc, rollback: 2 }).parts[0].volume,
    ).toBeCloseTo(14400, 6);
    doc.features[0].suppressed = true;
    expect(() => engine.regenerate(doc)).toThrow("Required sketch");
  });
  it("round trips exact STEP geometry with valid imported solids", () => {
    const doc = bracketDocument();
    expect(engine.stepRoundtrip(doc)[0]).toBeCloseTo(
      engine.regenerate(doc).parts[0].volume,
      4,
    );
    expect(new TextDecoder().decode(engine.export(doc, "step"))).toContain(
      "ISO-10303-21",
    );
  });
  it("exports STL and independently sums triangle volume", () => {
    const bytes = engine.export(block(), "stl");
    const text = new TextDecoder().decode(bytes);
    let volume = 0;
    const vertices = [
      ...text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g),
    ].map((m) => m.slice(1).map(Number));
    expect(vertices.length).toBe(36);
    for (let i = 0; i < vertices.length; i += 3) {
      const [a, b, c] = vertices.slice(i, i + 3);
      volume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
    }
    expect(Math.abs(volume)).toBeCloseTo(14400, 6);
  });
  it("cleans up across repeated builds, failures and exports", () => {
    for (let i = 0; i < 12; i++) {
      expect(engine.regenerate(block()).parts[0].volume).toBeCloseTo(14400, 5);
      engine.export(block(), "stl");
    }
    expect(engine.regenerate(emptyDocument()).parts).toHaveLength(0);
  });
  it("fillets and chamfers all edges of a box", () => {
    for (const type of ["fillet", "chamfer"] as const) {
      const doc = block();
      doc.features.push({
        id: type,
        name: type,
        type,
        suppressed: false,
        targetId: "base",
        radius: 1,
      });
      const part = engine.regenerate(doc).parts[0];
      expect(part.valid).toBe(true);
      expect(part.volume).toBeLessThan(14400);
    }
  });
  it("revolves a rectangle to a hollow turned component", () => {
    const doc = block(),
      sketch = doc.features[0];
    if (sketch.type === "sketch") {
      sketch.plane = "XZ";
      sketch.profile = { kind: "rectangle", x: 10, y: 0, width: 5, height: 20 };
    }
    doc.features[1] = {
      id: "turned",
      name: "Turned",
      type: "revolve",
      sketchId: "base-sketch",
      suppressed: false,
      targetId: null,
      operation: "new",
      angle: 360,
    };
    expect(engine.regenerate(doc).parts[0].volume).toBeCloseTo(
      Math.PI * (225 - 100) * 20,
      5,
    );
  });
});
describe("PlaneGCS diagnostics", () => {
  const point: SketchPrimitive = {
    id: "1",
    type: "point",
    x: 1,
    y: 2,
    fixed: false,
  };
  const cx: SketchPrimitive = {
    id: "2",
    type: "coordinate_x",
    p_id: "1",
    x: 10,
  };
  it("reports an underconstrained sketch", () => {
    expect(solvePrimitives(gcs, [point], "test").dof).toBe(2);
  });
  it("reports a satisfied sketch", () => {
    const d = solvePrimitives(
      gcs,
      [point, cx, { id: "3", type: "coordinate_y", p_id: "1", y: 20 }],
      "test",
    );
    expect(d.dof).toBe(0);
    expect(d.status).toBe("Success");
  });
  it("reports redundant constraints", () => {
    const d = solvePrimitives(gcs, [point, cx, { ...cx, id: "3" }], "test");
    expect(d.redundant.length).toBeGreaterThan(0);
  });
  it("reports conflicting constraints", () => {
    const d = solvePrimitives(
      gcs,
      [point, cx, { ...cx, id: "3", x: 20 }],
      "test",
    );
    expect(d.conflicts.length).toBeGreaterThan(0);
  });
});
describe("part identity and boolean failures", () => {
  it("preserves separate parts when adding an independent new feature", () => {
    const doc = block();
    doc.features.push({
      id: "second",
      name: "Second",
      type: "extrude",
      sketchId: "base-sketch",
      suppressed: false,
      depth: 10,
      operation: "new",
      targetId: null,
    });
    expect(engine.regenerate(doc).parts.map((p) => [p.id, p.volume])).toEqual([
      ["base", 14400],
      ["second", 24000],
    ]);
  });
  it("intersects two offset boxes at the exact expected volume", () => {
    const doc = block(),
      sketch = doc.features[0];
    if (sketch.type !== "sketch") throw new Error("Missing fixture sketch");
    doc.features.push({
      ...sketch,
      id: "tool-sketch",
      profile: { kind: "rectangle", x: 30, y: 20, width: 60, height: 40 },
    });
    doc.features.push({
      id: "intersect",
      name: "Intersect",
      type: "extrude",
      sketchId: "tool-sketch",
      depth: 6,
      operation: "intersect",
      targetId: "base",
      suppressed: false,
    });
    expect(engine.regenerate(doc).parts[0].volume).toBeCloseTo(30 * 20 * 6, 5);
  });
  it("rejects disconnected additions without changing input geometry", () => {
    const doc = block(),
      sketch = doc.features[0];
    if (sketch.type !== "sketch") throw new Error("Missing sketch");
    doc.features.push({
      ...sketch,
      id: "far-sketch",
      profile: { kind: "rectangle", x: 200, y: 200, width: 10, height: 10 },
    });
    doc.features.push({
      id: "add",
      name: "Add",
      type: "extrude",
      sketchId: "far-sketch",
      depth: 6,
      operation: "add",
      targetId: "base",
      suppressed: false,
    });
    expect(() => engine.regenerate(doc)).toThrow("connected solid");
    expect(engine.regenerate(block()).parts[0].volume).toBeCloseTo(14400, 5);
  });
  it("extrudes with consistent normal directions on all reference planes", () => {
    for (const plane of ["XY", "XZ", "YZ"] as const) {
      const doc = block(),
        sketch = doc.features[0];
      if (sketch.type === "sketch") sketch.plane = plane;
      const part = engine.regenerate(doc).parts[0];
      expect(part.volume).toBeCloseTo(14400, 5);
      expect(part.faces).toBe(6);
    }
  });
});

it("keeps analytic accuracy over different length scales", () => {
  for (const size of [0.001, 0.01, 1, 1000]) {
    const doc = block(),
      sketch = doc.features[0],
      extrude = doc.features[1];
    if (sketch.type === "sketch")
      sketch.profile = {
        kind: "rectangle",
        x: 0,
        y: 0,
        width: size,
        height: size,
      };
    if (extrude.type === "extrude") extrude.depth = size;
    const part = engine.regenerate(doc).parts[0];
    expect(Math.abs(part.volume - size ** 3)).toBeLessThanOrEqual(
      analyticTolerance(size ** 3),
    );
    expect(Math.abs(part.area - 6 * size ** 2)).toBeLessThanOrEqual(
      analyticTolerance(6 * size ** 2),
    );
  }
});
