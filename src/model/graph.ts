import { validateDocument, type Document, type Feature } from "./document";
export function references(feature: Feature): string[] {
  const refs: string[] = [];
  if ("sketchId" in feature) refs.push(feature.sketchId);
  if ("targetId" in feature && feature.targetId) refs.push(feature.targetId);
  return refs;
}
/** Feature references always point backwards; invalid reorders require repair. */
export function dependencyGraph(doc: Document): Map<string, string[]> {
  validateDocument(doc);
  return new Map(
    doc.features.map((feature) => [feature.id, references(feature)]),
  );
}
export function descendants(doc: Document, featureId: string): Set<string> {
  const affected = new Set([featureId]);
  for (const [id, refs] of dependencyGraph(doc))
    if (refs.some((ref) => affected.has(ref))) affected.add(id);
  affected.delete(featureId);
  return affected;
}
export function moveFeature(
  doc: Document,
  id: string,
  direction: -1 | 1,
): Document {
  const features = [...doc.features];
  const from = features.findIndex((f) => f.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= features.length) return doc;
  [features[from], features[to]] = [features[to], features[from]];
  return validateDocument({ ...doc, features, rollback: null });
}
export function removeFeature(doc: Document, id: string): Document {
  const affected = descendants(doc, id);
  if (affected.size)
    throw new Error(
      `Feature has ${affected.size} dependent feature(s). Repair those references before deleting it.`,
    );
  return validateDocument({
    ...doc,
    features: doc.features.filter((f) => f.id !== id),
    rollback: null,
  });
}
