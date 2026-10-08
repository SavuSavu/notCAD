import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Face,
  TopoDS_Edge,
} from "replicad-opencascadejs";
import type { ModuleStatic } from "@salusoft89/planegcs";
import {
  validateDocument,
  type Document,
  type Sketch,
} from "../model/document";
import { profilePrimitives, solvePrimitives } from "./solver";
import type { Mesh, ModelResult } from "./protocol";
class Scope {
  private objects: { delete(): void }[] = [];
  own<T extends { delete(): void }>(object: T): T {
    this.objects.push(object);
    return object;
  }
  dispose() {
    for (const object of this.objects.reverse()) object.delete();
  }
}
export function pointOnPlane(
  plane: Sketch["plane"],
  u: number,
  v: number,
  offset: number,
): [number, number, number] {
  return plane === "XY"
    ? [u, v, offset]
    : plane === "XZ"
      ? [u, offset, v]
      : [offset, u, v];
}
function normal(plane: Sketch["plane"]): [number, number, number] {
  return plane === "XY" ? [0, 0, 1] : plane === "XZ" ? [0, -1, 0] : [1, 0, 0];
}
/** Exact B-rep operations. Every embind object is owned by an explicit scope. */
export class Engine {
  constructor(
    private oc: OpenCascadeInstance,
    private gcs: ModuleStatic,
  ) {}
  private profile(sketch: Sketch, scope: Scope): TopoDS_Face {
    const oc = this.oc;
    const p = sketch.profile;
    const wire = scope.own(new oc.BRepBuilderAPI_MakeWire());
    if (p.kind === "rectangle") {
      const corners = [
        [p.x, p.y],
        [p.x + p.width, p.y],
        [p.x + p.width, p.y + p.height],
        [p.x, p.y + p.height],
      ];
      for (let i = 0; i < 4; i++) {
        const from = scope.own(
          new oc.gp_Pnt(
            ...pointOnPlane(
              sketch.plane,
              ...(corners[i] as [number, number]),
              sketch.offset,
            ),
          ),
        );
        const to = scope.own(
          new oc.gp_Pnt(
            ...pointOnPlane(
              sketch.plane,
              ...(corners[(i + 1) % 4] as [number, number]),
              sketch.offset,
            ),
          ),
        );
        const builder = scope.own(new oc.BRepBuilderAPI_MakeEdge(from, to));
        wire.Add(scope.own(builder.Edge()));
      }
    } else {
      const center = scope.own(
        new oc.gp_Pnt(...pointOnPlane(sketch.plane, p.x, p.y, sketch.offset)),
      );
      const direction = scope.own(new oc.gp_Dir(...normal(sketch.plane)));
      const axis = scope.own(new oc.gp_Ax2(center, direction));
      const circle = scope.own(new oc.gp_Circ(axis, p.radius));
      const builder = scope.own(new oc.BRepBuilderAPI_MakeEdge(circle));
      wire.Add(scope.own(builder.Edge()));
    }
    if (!wire.IsDone())
      throw new Error("Profile does not form a connected wire");
    const face = scope.own(
      new oc.BRepBuilderAPI_MakeFace(scope.own(wire.Wire()), true),
    );
    if (!face.IsDone()) throw new Error("Profile cannot form a planar face");
    return scope.own(face.Face());
  }
  private build(doc: Document, scope: Scope) {
    const oc = this.oc;
    const parts = new Map<string, { shape: TopoDS_Shape; name: string }>();
    const sketches = new Map<string, Sketch>();
    const diagnostics: ModelResult["diagnostics"] = [];
    const limit = doc.rollback ?? doc.features.length;
    for (const feature of doc.features.slice(0, limit)) {
      if (feature.suppressed) continue;
      try {
        if (feature.type === "sketch") {
          const diagnostic = solvePrimitives(
            this.gcs,
            profilePrimitives(feature),
            feature.id,
          );
          diagnostics.push(diagnostic);
          if (diagnostic.status !== "Success" || diagnostic.conflicts.length)
            throw new Error("Sketch constraints could not be satisfied");
          sketches.set(feature.id, feature);
          continue;
        }
        let shape: TopoDS_Shape;
        if ("sketchId" in feature) {
          const sketch = sketches.get(feature.sketchId);
          if (!sketch)
            throw new Error("Required sketch is suppressed or rolled back");
          const face = this.profile(sketch, scope);
          if (feature.type === "extrude") {
            const vector = scope.own(
              new oc.gp_Vec(
                ...(normal(sketch.plane).map((v) => v * feature.depth) as [
                  number,
                  number,
                  number,
                ]),
              ),
            );
            const builder = scope.own(
              new oc.BRepPrimAPI_MakePrism(face, vector, true, true),
            );
            shape = scope.own(builder.Shape());
          } else {
            const p = scope.own(
              new oc.gp_Pnt(...pointOnPlane(sketch.plane, 0, 0, sketch.offset)),
            );
            const v = sketch.plane === "XY" ? [0, 1, 0] : [0, 0, 1];
            const axis = scope.own(
              new oc.gp_Ax1(
                p,
                scope.own(new oc.gp_Dir(...(v as [number, number, number]))),
              ),
            );
            const builder = scope.own(
              new oc.BRepPrimAPI_MakeRevol(
                face,
                axis,
                (feature.angle * Math.PI) / 180,
                true,
              ),
            );
            shape = scope.own(builder.Shape());
          }
          if (feature.operation !== "new") {
            const target = parts.get(feature.targetId!);
            if (!target) throw new Error("Required target part is unavailable");
            const builder = scope.own(
              feature.operation === "add"
                ? new oc.BRepAlgoAPI_Fuse(target.shape, shape)
                : feature.operation === "remove"
                  ? new oc.BRepAlgoAPI_Cut(target.shape, shape)
                  : new oc.BRepAlgoAPI_Common(target.shape, shape),
            );
            if (!builder.IsDone()) throw new Error("Boolean operation failed");
            shape = scope.own(builder.Shape());
          }
        } else {
          const target = parts.get(feature.targetId);
          if (!target) throw new Error("Required target part is unavailable");
          const builder = scope.own(
            feature.type === "fillet"
              ? new oc.BRepFilletAPI_MakeFillet(target.shape)
              : new oc.BRepFilletAPI_MakeChamfer(target.shape),
          );
          const explorer = scope.own(
            new oc.TopExp_Explorer(
              target.shape,
              oc.TopAbs_ShapeEnum.TopAbs_EDGE,
            ),
          );
          const edges: TopoDS_Edge[] = [];
          for (; explorer.More(); explorer.Next()) {
            const edge = scope.own(
              oc.TopoDS.Edge(scope.own(explorer.Current())),
            );
            if (edges.some((other) => other.IsSame(edge))) continue;
            edges.push(edge);
            builder.Add(feature.radius, edge);
          }
          builder.Build();
          if (!builder.IsDone())
            throw new Error(`${feature.type} cannot be built at this size`);
          shape = scope.own(builder.Shape());
        }
        const check = scope.own(new oc.BRepCheck_Analyzer(shape));
        if (shape.IsNull() || !check.IsValid())
          throw new Error("Kernel produced invalid geometry");
        const solids = scope.own(
          new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID),
        );
        let solidCount = 0;
        for (; solids.More(); solids.Next()) solidCount++;
        if (solidCount !== 1)
          throw new Error(
            "Each part must remain one connected solid. Disconnected boolean results need a split workflow, which is not implemented yet.",
          );
        const props = scope.own(new oc.GProp_GProps());
        oc.BRepGProp.VolumeProperties(shape, props, true, false, false);
        if (!Number.isFinite(props.Mass()) || props.Mass() <= 0)
          throw new Error("Operation produced no closed solid");
        const partId =
          "operation" in feature && feature.operation === "new"
            ? feature.id
            : feature.targetId!;
        parts.set(partId, {
          shape,
          name: parts.get(partId)?.name ?? feature.name,
        });
      } catch (error) {
        throw new Error(
          `${feature.name}: ${error instanceof Error ? error.message : "Kernel operation failed"}`,
        );
      }
    }
    return { parts, diagnostics };
  }
  private mesh(shape: TopoDS_Shape, scope: Scope): Mesh {
    const oc = this.oc;
    scope.own(new oc.BRepMesh_IncrementalMesh(shape, 0.1, false, 0.3, false));
    const positions: number[] = [],
      indices: number[] = [],
      faceRanges: Mesh["faceRanges"] = [];
    const explorer = scope.own(
      new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE),
    );
    for (let faceIndex = 0; explorer.More(); explorer.Next(), faceIndex++) {
      const faceScope = new Scope();
      try {
        const face = faceScope.own(
          oc.TopoDS.Face(faceScope.own(explorer.Current())),
        );
        const location = faceScope.own(new oc.TopLoc_Location());
        const triangulation = faceScope.own(
          oc.BRep_Tool.Triangulation(face, location, 0),
        );
        const transform = faceScope.own(location.Transformation());
        const offset = positions.length / 3;
        for (let i = 1; i <= triangulation.NbNodes(); i++) {
          const point = triangulation.Node(i);
          try {
            point.Transform(transform);
            positions.push(point.X(), point.Y(), point.Z());
          } finally {
            point.delete();
          }
        }
        const start = indices.length;
        for (let i = 1; i <= triangulation.NbTriangles(); i++) {
          const triangle = triangulation.Triangle(i);
          try {
            const nodes = [
              triangle.Value(1),
              triangle.Value(2),
              triangle.Value(3),
            ];
            if (face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED)
              nodes.reverse();
            indices.push(...nodes.map((n) => offset + n - 1));
          } finally {
            triangle.delete();
          }
        }
        faceRanges.push({
          index: faceIndex,
          start,
          count: indices.length - start,
        });
      } finally {
        faceScope.dispose();
      }
    }
    return { positions, indices, faceRanges };
  }
  regenerate(input: Document): ModelResult {
    const doc = validateDocument(input),
      scope = new Scope();
    try {
      const { parts, diagnostics } = this.build(doc, scope);
      return {
        diagnostics,
        parts: [...parts].map(([id, { shape, name }]) => {
          const volume = scope.own(new this.oc.GProp_GProps()),
            area = scope.own(new this.oc.GProp_GProps());
          this.oc.BRepGProp.VolumeProperties(shape, volume, true, false, false);
          this.oc.BRepGProp.SurfaceProperties(shape, area, false, false);
          const mesh = this.mesh(shape, scope);
          return {
            id,
            name,
            volume: volume.Mass(),
            area: area.Mass(),
            valid: true,
            faces: mesh.faceRanges.length,
            mesh,
          };
        }),
      };
    } finally {
      scope.dispose();
    }
  }
  export(input: Document, format: "step" | "stl"): Uint8Array {
    const scope = new Scope(),
      oc = this.oc;
    const path = `/export.${format}`;
    try {
      const { parts } = this.build(validateDocument(input), scope);
      if (!parts.size) throw new Error("There are no solids to export");
      const compound = scope.own(new oc.TopoDS_Compound());
      const builder = scope.own(new oc.TopoDS_Builder());
      builder.MakeCompound(compound);
      for (const { shape } of parts.values()) builder.Add(compound, shape);
      if (format === "step") {
        const writer = scope.own(new oc.STEPControl_Writer());
        const progress = scope.own(new oc.Message_ProgressRange());
        if (
          writer.Transfer(
            compound,
            oc.STEPControl_StepModelType.STEPControl_AsIs,
            true,
            progress,
          ) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone
        )
          throw new Error("STEP transfer failed");
        if (writer.Write(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone)
          throw new Error("STEP write failed");
      } else {
        this.mesh(compound, scope);
        const writer = scope.own(new oc.StlAPI_Writer());
        if (
          !writer.Write(
            compound,
            path,
            scope.own(new oc.Message_ProgressRange()),
          )
        )
          throw new Error("STL write failed");
      }
      return oc.FS.readFile(path).slice();
    } finally {
      try {
        oc.FS.unlink(path);
      } catch {
        /* A failed writer may not create a file. */
      }
      scope.dispose();
    }
  }
  stepRoundtrip(input: Document): number[] {
    const bytes = this.export(input, "step"),
      scope = new Scope(),
      oc = this.oc;
    try {
      oc.FS.writeFile("/roundtrip.step", bytes);
      const reader = scope.own(new oc.STEPControl_Reader());
      if (
        reader.ReadFile("/roundtrip.step") !==
        oc.IFSelect_ReturnStatus.IFSelect_RetDone
      )
        throw new Error("STEP read failed");
      reader.TransferRoots();
      const shape = scope.own(reader.OneShape());
      const explorer = scope.own(
        new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID),
      );
      const volumes: number[] = [];
      for (; explorer.More(); explorer.Next()) {
        const solid = scope.own(explorer.Current()),
          props = scope.own(new oc.GProp_GProps());
        const check = scope.own(new oc.BRepCheck_Analyzer(solid));
        if (!check.IsValid()) throw new Error("Imported STEP solid is invalid");
        oc.BRepGProp.VolumeProperties(solid, props, true, false, false);
        volumes.push(props.Mass());
      }
      return volumes;
    } finally {
      oc.FS.unlink("/roundtrip.step");
      scope.dispose();
    }
  }
}
