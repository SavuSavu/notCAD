import type { CadDocument } from "../core/model";
import type { SketchPrimitive } from "@salusoft89/planegcs";
import type { ShapeMesh } from "replicad";
import type { SolveReport } from "./solver";

export interface PartMesh {
  id: string;
  name: string;
  mesh: ShapeMesh;
  edges: number[];
  volume: number;
  area: number;
  valid: boolean;
  faces: number;
  solids: number;
  bounds: [[number, number, number], [number, number, number]];
}
export interface ModelResult {
  parts: PartMesh[];
  sketches: Record<string, SolveReport>;
  regenerated: number;
}
export type Operation =
  | { kind: "regenerate"; document: CadDocument }
  | { kind: "preview"; document: CadDocument }
  | { kind: "export"; format: "step" | "stl"; partId?: string }
  | { kind: "solve"; primitives: SketchPrimitive[] }
  | { kind: "inspect-step"; data: Uint8Array };
export interface KernelRequest {
  id: number;
  revision: number;
  operation: Operation;
}
export type KernelResponse = { id: number; revision: number } & (
  | { ok: true; result: ModelResult | SolveReport | Blob | PartMesh }
  | { ok: false; error: string }
);
