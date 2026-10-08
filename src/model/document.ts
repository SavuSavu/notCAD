import { z } from "zod";
const id = z.string().min(1).max(120);
const length = z.number().finite().min(0.001).max(10000);
const coordinate = z.number().finite().min(-10000).max(10000);
const common = {
  id,
  name: z.string().min(1).max(120),
  suppressed: z.boolean(),
};
const profile = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rectangle"),
      x: coordinate,
      y: coordinate,
      width: length,
      height: length,
    })
    .strict(),
  z
    .object({
      kind: z.literal("circle"),
      x: coordinate,
      y: coordinate,
      radius: length,
    })
    .strict(),
]);
const sketch = z
  .object({
    ...common,
    type: z.literal("sketch"),
    plane: z.enum(["XY", "XZ", "YZ"]),
    offset: coordinate,
    profile,
  })
  .strict();
const operation = z.enum(["new", "add", "remove", "intersect"]);
const extrude = z
  .object({
    ...common,
    type: z.literal("extrude"),
    sketchId: id,
    depth: length,
    operation,
    targetId: id.nullable(),
  })
  .strict();
const revolve = z
  .object({
    ...common,
    type: z.literal("revolve"),
    sketchId: id,
    angle: z.number().finite().min(0.1).max(360),
    operation,
    targetId: id.nullable(),
  })
  .strict();
const finish = z
  .object({
    ...common,
    type: z.enum(["fillet", "chamfer"]),
    targetId: id,
    radius: length,
  })
  .strict();
export const featureSchema = z.union([sketch, extrude, revolve, finish]);
export const documentSchema = z
  .object({
    format: z.literal("notcad"),
    version: z.literal(1),
    id,
    name: z.string().min(1).max(120),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    units: z.enum(["mm", "in"]),
    features: z.array(featureSchema).max(500),
    rollback: z.number().int().min(0).max(500).nullable(),
  })
  .strict();
export type Document = z.infer<typeof documentSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Sketch = z.infer<typeof sketch>;
export type Profile = z.infer<typeof profile>;
export type Plane = Sketch["plane"];
export function validateDocument(input: unknown): Document {
  const doc = documentSchema.parse(input);
  const previous = new Map<string, Feature>();
  for (const feature of doc.features) {
    if (previous.has(feature.id))
      throw new Error(`Duplicate feature identifier: ${feature.id}`);
    if (
      "sketchId" in feature &&
      previous.get(feature.sketchId)?.type !== "sketch"
    )
      throw new Error(`${feature.name}: missing or forward sketch reference`);
    if ("targetId" in feature) {
      if ("operation" in feature && feature.operation === "new") {
        if (feature.targetId !== null)
          throw new Error("New parts cannot have a boolean target");
      } else {
        const target = previous.get(feature.targetId ?? "");
        if (!target || !("operation" in target) || target.operation !== "new")
          throw new Error(
            `${feature.name}: target must be an earlier part-producing feature`,
          );
      }
    }
    previous.set(feature.id, feature);
  }
  if (doc.rollback !== null && doc.rollback > doc.features.length)
    throw new Error("Rollback exceeds feature count");
  return doc;
}
export function emptyDocument(): Document {
  return {
    format: "notcad",
    version: 1,
    id: crypto.randomUUID(),
    name: "Untitled part",
    revision: 0,
    units: "mm",
    features: [],
    rollback: null,
  };
}
export function revise(doc: Document, changes: Partial<Document>): Document {
  return validateDocument({ ...doc, ...changes, revision: doc.revision + 1 });
}
export function bracketDocument(): Document {
  const doc = emptyDocument();
  const base: Sketch = {
    id: "base-sketch",
    name: "Base · 60 × 40",
    type: "sketch",
    suppressed: false,
    plane: "XY",
    offset: 0,
    profile: { kind: "rectangle", x: 0, y: 0, width: 60, height: 40 },
  };
  return {
    ...doc,
    name: "Mechanical bracket",
    features: [
      base,
      {
        id: "base",
        name: "Base · 6 mm",
        type: "extrude",
        suppressed: false,
        sketchId: base.id,
        depth: 6,
        operation: "new",
        targetId: null,
      },
      {
        ...base,
        id: "upright-sketch",
        name: "Upright · 60 × 6",
        offset: 6,
        profile: { kind: "rectangle", x: 0, y: 0, width: 60, height: 6 },
      },
      {
        id: "upright",
        name: "Upright · 34 mm",
        type: "extrude",
        suppressed: false,
        sketchId: "upright-sketch",
        depth: 34,
        operation: "add",
        targetId: "base",
      },
      {
        ...base,
        id: "hole-sketch",
        name: "Mounting hole · Ø8",
        profile: { kind: "circle", x: 30, y: 25, radius: 4 },
      },
      {
        id: "hole",
        name: "Mounting hole · cut",
        type: "extrude",
        suppressed: false,
        sketchId: "hole-sketch",
        depth: 6,
        operation: "remove",
        targetId: "base",
      },
    ],
  };
}
