import {
  sketchCircle,
  sketchRectangle,
  exportSTEP,
  makeCompound,
  measureArea,
  measureVolume,
  getOC,
  importSTEP,
  isShape3D,
  type Shape3D,
  type AnyShape,
} from "replicad";
import type { ModuleStatic } from "@salusoft89/planegcs";
import {
  parseDocument,
  sketchOrigin,
  type CadDocument,
  type Feature,
  type SketchFeature,
} from "../core/model";
import { profilePrimitives, solvePrimitives, type SolveReport } from "./solver";
import type { PartMesh, ModelResult } from "./protocol";

type Parts = Map<string, Shape3D>;
type Stage = {
  signature: string;
  parts: Parts;
  sketches: Map<string, SketchFeature>;
  reports: Record<string, SolveReport>;
};
function dispose(parts: Parts) {
  for (const part of parts.values()) part.delete();
  parts.clear();
}
function cloneParts(parts: Parts) {
  return new Map([...parts].map(([id, p]) => [id, p.clone() as Shape3D]));
}
export function describeShape(
  shape: AnyShape,
  id: string,
  name: string,
): PartMesh {
  if (!isShape3D(shape)) throw new Error("Expected a solid shape.");
  const oc = getOC();
  const checker = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
  const bounds = shape.boundingBox;
  const faces = shape.faces,
    solids = shape.solids;
  try {
    const valid = checker.IsValid(shape.wrapped);
    if (!valid || !solids.length)
      throw new Error("The operation did not produce a valid solid.");
    return {
      id,
      name,
      valid,
      faces: faces.length,
      solids: solids.length,
      bounds: bounds.bounds,
      volume: measureVolume(shape),
      area: measureArea(shape),
      mesh: shape.mesh({ tolerance: 0.05, angularTolerance: 0.15 }),
      edges: shape.meshEdges({ tolerance: 0.05, angularTolerance: 0.15 }).lines,
    };
  } finally {
    checker.delete();
    bounds.delete();
    faces.forEach((f) => f.delete());
    solids.forEach((s) => s.delete());
  }
}

/** Stage cache owns every shape wrapper. A failed candidate never replaces committed stages. */
export class GeometryEngine {
  private stages: Stage[] = [];
  private document: CadDocument | null = null;
  constructor(private solver: ModuleStatic) {}
  regenerate(value: CadDocument): ModelResult {
    const doc = parseDocument(value),
      active = doc.features.slice(0, doc.rollback ?? doc.features.length);
    let prefix = 0;
    while (
      prefix < active.length &&
      prefix < this.stages.length &&
      JSON.stringify(active[prefix]) === this.stages[prefix].signature
    )
      prefix++;
    const added: Stage[] = [];
    let previous = this.stages[prefix - 1];
    try {
      for (const feature of active.slice(prefix)) {
        const stage: Stage = {
          signature: JSON.stringify(feature),
          parts: cloneParts(previous?.parts ?? new Map()),
          sketches: new Map(previous?.sketches),
          reports: { ...previous?.reports },
        };
        added.push(stage);
        if (!feature.suppressed) {
          try {
            this.apply(stage, feature);
          } catch (error) {
            throw new Error(
              `${feature.name}: ${error instanceof Error ? error.message : "Geometry operation failed. Check dimensions and references."}`,
            );
          }
        }
        previous = stage;
      }
      const parts = [...(previous?.parts ?? new Map<string, Shape3D>())].map(
        ([id, shape]) =>
          describeShape(
            shape,
            id,
            doc.features.find((f) => f.id === id)?.name ?? "Part",
          ),
      );
      const result = {
        parts,
        sketches: previous?.reports ?? {},
        regenerated: added.length,
      };
      this.stages.slice(prefix).forEach((stage) => dispose(stage.parts));
      this.stages = [...this.stages.slice(0, prefix), ...added];
      this.document = doc;
      return result;
    } catch (error) {
      added.forEach((stage) => dispose(stage.parts));
      throw error;
    }
  }
  private apply(stage: Stage, f: Feature) {
    if (f.type === "sketch") {
      const report = solvePrimitives(this.solver, profilePrimitives(f));
      if (report.status === "inconsistent")
        throw new Error("Sketch constraints are inconsistent.");
      stage.sketches.set(f.id, f);
      stage.reports[f.id] = report;
      return;
    }
    if (f.type === "fillet" || f.type === "chamfer") {
      const target = stage.parts.get(f.targetId);
      if (!target)
        throw new Error(
          "Target part is unavailable. Unsuppress it or repair the reference.",
        );
      const changed =
        f.type === "fillet"
          ? target.fillet(f.radius)
          : target.chamfer(f.radius);
      target.delete();
      stage.parts.set(f.targetId, changed);
      return;
    }
    const profile = stage.sketches.get(f.sketchId);
    if (!profile)
      throw new Error(
        "Sketch is unavailable. Unsuppress it or repair the reference.",
      );
    // Build one prism spanning both ends, avoiding an unnecessary Boolean seam.
    // Legacy records without an extent retain their signed, one-sided distance.
    const second =
      f.type === "extrude" && f.extent === "two-sided"
        ? Math.sign(f.distance) * f.secondDistance!
        : 0;
    const start =
      f.type === "extrude" && f.extent === "symmetric"
        ? -f.distance / 2
        : -second;
    const config = {
      plane: profile.plane,
      origin: sketchOrigin({ ...profile, offset: profile.offset + start }),
    };
    const sketch =
      profile.profile.kind === "rectangle"
        ? sketchRectangle(profile.profile.width, profile.profile.height, config)
        : sketchCircle(profile.profile.radius, config);
    // Replicad consumes the sketch on success; delete() is idempotent on its wrappers.
    let solid: Shape3D;
    try {
      solid =
        f.type === "extrude"
          ? sketch.extrude(f.distance + second)
          : sketch.revolve(
              f.axis === "X"
                ? [1, 0, 0]
                : f.axis === "Y"
                  ? [0, 1, 0]
                  : [0, 0, 1],
              { origin: [0, 0, 0], angle: f.angle },
            );
    } finally {
      sketch.delete();
    }
    if (f.mode === "new") {
      stage.parts.set(f.id, solid);
      return;
    }
    try {
      const target = stage.parts.get(f.targetId!);
      if (!target)
        throw new Error("Target part is unavailable. Repair the reference.");
      const next =
        f.mode === "add"
          ? target.fuse(solid)
          : f.mode === "remove"
            ? target.cut(solid)
            : target.intersect(solid);
      target.delete();
      stage.parts.set(f.targetId!, next);
    } finally {
      solid.delete();
    }
  }
  export(format: "step" | "stl", partId?: string): Blob {
    const parts = this.stages.at(-1)?.parts;
    const selected = parts
      ? [...parts].filter(([id]) => !partId || id === partId)
      : [];
    if (!selected.length)
      throw new Error("Select or create a solid before exporting.");
    if (format === "step")
      return exportSTEP(
        selected.map(([id, shape]) => ({
          shape,
          name: this.document?.features.find((f) => f.id === id)?.name ?? id,
        })),
        { unit: "MM", modelUnit: "MM" },
      );
    const compound = makeCompound(selected.map(([, shape]) => shape));
    try {
      return compound.blobSTL({
        tolerance: 0.02,
        angularTolerance: 0.1,
        binary: true,
      });
    } finally {
      compound.delete();
    }
  }
  dispose() {
    this.stages.forEach((stage) => dispose(stage.parts));
    this.stages = [];
    this.document = null;
  }
}
export async function inspectStep(data: Uint8Array) {
  const shape = await importSTEP(new Blob([new Uint8Array(data)]));
  try {
    return describeShape(shape, "import", "Imported STEP");
  } finally {
    shape.delete();
  }
}
