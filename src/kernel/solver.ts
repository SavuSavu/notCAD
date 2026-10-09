import {
  GcsWrapper,
  SolveStatus,
  type ModuleStatic,
  type SketchPrimitive,
} from "@salusoft89/planegcs";
import type { SketchFeature } from "../core/model";

export interface SolveReport {
  status: "satisfied" | "underconstrained" | "redundant" | "inconsistent";
  dof: number;
  conflicts: string[];
  redundant: string[];
  primitives: SketchPrimitive[];
}
export function solvePrimitives(
  module: ModuleStatic,
  primitives: SketchPrimitive[],
): SolveReport {
  const solver = new GcsWrapper(new module.GcsSystem(), module);
  try {
    solver.push_primitives_and_params(structuredClone(primitives));
    const status = solver.solve();
    const conflicts = solver.get_gcs_conflicting_constraints();
    const redundant = [
      ...solver.get_gcs_redundant_constraints(),
      ...solver.get_gcs_partially_redundant_constraints(),
    ];
    const dof = solver.gcs.dof();
    const failed =
      status === SolveStatus.Failed ||
      status === SolveStatus.SuccessfulSolutionInvalid ||
      conflicts.length > 0;
    if (!failed) solver.apply_solution();
    return {
      status: failed
        ? "inconsistent"
        : redundant.length
          ? "redundant"
          : dof > 0
            ? "underconstrained"
            : "satisfied",
      dof,
      conflicts,
      redundant,
      primitives: structuredClone(solver.sketch_index.get_primitives()),
    };
  } finally {
    solver.destroy_gcs_module();
  }
}
export function profilePrimitives(sketch: SketchFeature): SketchPrimitive[] {
  const p = sketch.profile;
  if (p.kind === "circle")
    return [
      { id: "1", type: "point", x: sketch.x, y: sketch.y, fixed: true },
      { id: "2", type: "circle", c_id: "1", radius: p.radius },
      { id: "3", type: "circle_diameter", c_id: "2", diameter: p.radius * 2 },
    ];
  const x = sketch.x - p.width / 2,
    y = sketch.y - p.height / 2;
  return [
    { id: "1", type: "point", x, y, fixed: true },
    { id: "2", type: "point", x: x + p.width, y, fixed: false },
    { id: "3", type: "point", x: x + p.width, y: y + p.height, fixed: false },
    { id: "4", type: "point", x, y: y + p.height, fixed: false },
    { id: "5", type: "horizontal_pp", p1_id: "1", p2_id: "2" },
    { id: "6", type: "vertical_pp", p1_id: "2", p2_id: "3" },
    { id: "7", type: "horizontal_pp", p1_id: "3", p2_id: "4" },
    { id: "8", type: "vertical_pp", p1_id: "4", p2_id: "1" },
    { id: "9", type: "coordinate_x", p_id: "2", x: x + p.width },
    { id: "10", type: "coordinate_y", p_id: "3", y: y + p.height },
  ];
}
