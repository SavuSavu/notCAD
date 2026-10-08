import { expect, it } from "vitest";
import { bracketDocument } from "../src/model/document";
import { descendants, moveFeature, removeFeature } from "../src/model/graph";
it("finds transitive downstream regeneration dependencies", () => {
  expect([...descendants(bracketDocument(), "base-sketch")]).toEqual([
    "base",
    "upright",
    "hole",
  ]);
});
it("permits independent reorders and rejects broken forward references", () => {
  const doc = bracketDocument();
  expect(moveFeature(doc, "upright-sketch", -1).features[1].id).toBe(
    "upright-sketch",
  );
  expect(() => moveFeature(doc, "base", -1)).toThrow("forward sketch");
});
it("requires reference repair before deleting a dependency", () => {
  const doc = bracketDocument();
  expect(() => removeFeature(doc, "base")).toThrow("dependent");
  expect(removeFeature(doc, "hole").features).toHaveLength(5);
});
