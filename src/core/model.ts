import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const scalar = z.number().finite().min(-100000).max(100000);
const positive = z.number().finite().min(0.001).max(100000);
const base = { id, name: z.string().min(1).max(120), suppressed: z.boolean() };
const sketch = z
  .object({
    ...base,
    type: z.literal("sketch"),
    plane: z.enum(["XY", "XZ", "YZ"]),
    x: scalar,
    y: scalar,
    offset: scalar,
    profile: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("rectangle"),
          width: positive,
          height: positive,
        })
        .strict(),
      z.object({ kind: z.literal("circle"), radius: positive }).strict(),
    ]),
  })
  .strict();
const operation = {
  sketchId: id,
  mode: z.enum(["new", "add", "remove", "intersect"]),
  targetId: id.optional(),
};
export const featureSchema = z.discriminatedUnion("type", [
  sketch,
  z
    .object({
      ...base,
      type: z.literal("extrude"),
      ...operation,
      distance: scalar.refine((n) => Math.abs(n) >= 0.001),
      extent: z.enum(["one-sided", "symmetric", "two-sided"]).optional(),
      secondDistance: positive.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("revolve"),
      ...operation,
      angle: z.number().min(0.01).max(360),
      axis: z.enum(["X", "Y", "Z"]),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("fillet"),
      targetId: id,
      radius: positive,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("chamfer"),
      targetId: id,
      radius: positive,
    })
    .strict(),
]);
export type Feature = z.infer<typeof featureSchema>;
export type SketchFeature = Extract<Feature, { type: "sketch" }>;
export const documentSchema = z
  .object({
    format: z.literal("notcad"),
    version: z.literal(1),
    id,
    name: z.string().min(1).max(120),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    units: z.enum(["mm", "in"]),
    features: z.array(featureSchema).max(200),
    rollback: z.number().int().min(0).max(200).nullable(),
  })
  .strict();
export type CadDocument = z.infer<typeof documentSchema>;
export const uid = () => crypto.randomUUID();
export const emptyDocument = (): CadDocument => ({
  format: "notcad",
  version: 1,
  id: uid(),
  name: "Untitled part",
  revision: 0,
  units: "mm",
  features: [],
  rollback: null,
});
export function dependencies(f: Feature): string[] {
  return f.type === "sketch"
    ? []
    : f.type === "extrude" || f.type === "revolve"
      ? [
          f.sketchId,
          ...(f.mode === "new" ? [] : f.targetId ? [f.targetId] : []),
        ]
      : [f.targetId];
}
export function parseDocument(value: unknown): CadDocument {
  const doc = documentSchema.parse(value);
  if (doc.rollback !== null && doc.rollback > doc.features.length)
    throw new Error("Rollback exceeds history length.");
  const seen = new Map<string, Feature>();
  for (const f of doc.features) {
    if (seen.has(f.id))
      throw new Error(`Duplicate feature identifier: ${f.id}`);
    for (const ref of dependencies(f))
      if (!seen.has(ref))
        throw new Error(
          `${f.name}: missing or forward reference ${ref}. Repair the reference before continuing.`,
        );
    if (f.type === "extrude" || f.type === "revolve") {
      if (seen.get(f.sketchId)?.type !== "sketch")
        throw new Error(`${f.name}: profile must reference a sketch.`);
      if (f.mode !== "new" && !f.targetId)
        throw new Error(`${f.name}: select a target part.`);
    }
    if (f.type === "extrude") {
      if (f.extent === "two-sided" && f.secondDistance === undefined)
        throw new Error(`${f.name}: enter the second distance.`);
      if (f.extent !== "two-sided" && f.secondDistance !== undefined)
        throw new Error(`${f.name}: second distance requires two directions.`);
    }
    if ("targetId" in f && f.targetId) {
      const target = seen.get(f.targetId);
      if (!target || !("mode" in target) || target.mode !== "new")
        throw new Error(
          `${f.name}: target must identify a part-producing feature.`,
        );
    }
    seen.set(f.id, f);
  }
  return doc;
}
export function replaceFeature(
  doc: CadDocument,
  feature: Feature,
): CadDocument {
  const index = doc.features.findIndex((f) => f.id === feature.id);
  const features = [...doc.features];
  if (index < 0) features.push(feature);
  else features[index] = feature;
  return parseDocument({ ...doc, features, rollback: null });
}
export function moveFeature(doc: CadDocument, id: string, delta: number) {
  const features = [...doc.features],
    index = features.findIndex((f) => f.id === id),
    to = index + delta;
  if (index < 0 || to < 0 || to >= features.length) return doc;
  [features[index], features[to]] = [features[to], features[index]];
  return parseDocument({ ...doc, features });
}
export function sketchOrigin(f: SketchFeature): [number, number, number] {
  // Matches OpenCascade's named plane basis: XZ normal is -Y, YZ x-axis is Y.
  return f.plane === "XY"
    ? [f.x, f.y, f.offset]
    : f.plane === "XZ"
      ? [f.x, -f.offset, f.y]
      : [f.offset, f.x, f.y];
}
export function bracketDocument(): CadDocument {
  const base = { suppressed: false };
  return {
    ...emptyDocument(),
    name: "Mounting bracket",
    features: [
      {
        ...base,
        id: "base-profile",
        name: "Base profile",
        type: "sketch",
        plane: "XY",
        x: 0,
        y: 0,
        offset: 0,
        profile: { kind: "rectangle", width: 60, height: 40 },
      },
      {
        ...base,
        id: "base",
        name: "Base plate",
        type: "extrude",
        sketchId: "base-profile",
        mode: "new",
        distance: 6,
      },
      {
        ...base,
        id: "wall-profile",
        name: "Upright profile",
        type: "sketch",
        plane: "XY",
        x: 0,
        y: 17,
        offset: 6,
        profile: { kind: "rectangle", width: 60, height: 6 },
      },
      {
        ...base,
        id: "wall",
        name: "Upright",
        type: "extrude",
        sketchId: "wall-profile",
        mode: "add",
        targetId: "base",
        distance: 34,
      },
      {
        ...base,
        id: "hole-profile",
        name: "Mounting hole",
        type: "sketch",
        plane: "XY",
        x: 0,
        y: -3,
        offset: 0,
        profile: { kind: "circle", radius: 5 },
      },
      {
        ...base,
        id: "hole",
        name: "Through hole",
        type: "extrude",
        sketchId: "hole-profile",
        mode: "remove",
        targetId: "base",
        distance: 6,
      },
    ],
  };
}
