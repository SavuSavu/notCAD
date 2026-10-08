import type { Document } from "../model/document";
export interface Mesh {
  positions: number[];
  indices: number[];
  faceRanges: { start: number; count: number; index: number }[];
}
export interface Part {
  id: string;
  name: string;
  mesh: Mesh;
  volume: number;
  area: number;
  faces: number;
  valid: boolean;
}
export interface Diagnostics {
  featureId: string;
  status: string;
  dof: number;
  conflicts: string[];
  redundant: string[];
}
export interface ModelResult {
  parts: Part[];
  diagnostics: Diagnostics[];
}
export type Request = { id: number; revision: number } & (
  | { type: "regenerate"; document: Document }
  | { type: "export"; document: Document; format: "step" | "stl" }
  | { type: "roundtrip"; document: Document }
);
export type Response = { id: number; revision: number } & (
  | { ok: true; type: "regenerate"; result: ModelResult }
  | { ok: true; type: "export"; bytes: Uint8Array }
  | { ok: true; type: "roundtrip"; volumes: number[] }
  | { ok: false; error: string }
);
