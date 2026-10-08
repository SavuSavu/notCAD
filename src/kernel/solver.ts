import {
  GcsWrapper,
  SolveStatus,
  type ModuleStatic,
  type SketchPrimitive,
} from "@salusoft89/planegcs";
import type { Sketch } from "../model/document";
import type { Diagnostics } from "./protocol";
export function profilePrimitives(sketch: Sketch): SketchPrimitive[] {
  const p = sketch.profile;
  if (p.kind === "circle")
    return [
      { id: "1", type: "point", x: p.x, y: p.y, fixed: true },
      { id: "2", type: "circle", c_id: "1", radius: p.radius },
      { id: "3", type: "circle_diameter", c_id: "2", diameter: p.radius * 2 },
    ];
  return [
    { id: "1", type: "point", x: p.x, y: p.y, fixed: true },
    { id: "2", type: "point", x: p.x + p.width, y: p.y, fixed: false },
    {
      id: "3",
      type: "point",
      x: p.x + p.width,
      y: p.y + p.height,
      fixed: false,
    },
    { id: "4", type: "point", x: p.x, y: p.y + p.height, fixed: false },
    { id: "5", type: "line", p1_id: "1", p2_id: "2" },
    { id: "6", type: "line", p1_id: "2", p2_id: "3" },
    { id: "7", type: "line", p1_id: "3", p2_id: "4" },
    { id: "8", type: "line", p1_id: "4", p2_id: "1" },
    { id: "9", type: "horizontal_l", l_id: "5" },
    { id: "10", type: "vertical_l", l_id: "6" },
    { id: "11", type: "horizontal_l", l_id: "7" },
    { id: "12", type: "vertical_l", l_id: "8" },
    {
      id: "13",
      type: "p2p_distance",
      p1_id: "1",
      p2_id: "2",
      distance: p.width,
    },
    {
      id: "14",
      type: "p2p_distance",
      p1_id: "2",
      p2_id: "3",
      distance: p.height,
    },
  ];
}
export function solvePrimitives(
  module: ModuleStatic,
  primitives: SketchPrimitive[],
  featureId: string,
): Diagnostics {
  const wrapper = new GcsWrapper(new module.GcsSystem(), module);
  try {
    wrapper.push_primitives_and_params(primitives);
    const status = wrapper.solve();
    const conflicts = wrapper.get_gcs_conflicting_constraints();
    const redundant = wrapper.get_gcs_redundant_constraints();
    if (status === SolveStatus.Success) wrapper.apply_solution();
    return {
      featureId,
      status:
        ["Success", "Converged", "Failed", "SuccessfulSolutionInvalid"][
          status
        ] ?? "Failed",
      dof: wrapper.gcs.dof(),
      conflicts,
      redundant,
    };
  } finally {
    wrapper.destroy_gcs_module();
  }
}
