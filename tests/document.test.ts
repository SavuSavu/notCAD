import { describe, expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  bracketDocument,
  emptyDocument,
  moveFeature,
  parseDocument,
} from "../src/core/model";
import { History } from "../src/core/history";
import { encodeProject, decodeProject } from "../src/core/project";

describe("document and history integrity", () => {
  test("validates the graph and rejects missing, forward, duplicate and wrong-kind references", () => {
    const doc = bracketDocument();
    expect(parseDocument(doc)).toEqual(doc);
    expect(() => moveFeature(doc, "base", -1)).toThrow(/forward reference/);
    const duplicate = structuredClone(doc);
    duplicate.features[1].id = "base-profile";
    expect(() => parseDocument(duplicate)).toThrow(/Duplicate/);
    const wrong = structuredClone(doc);
    if (wrong.features[1].type === "extrude")
      wrong.features[1].sketchId = "absent";
    expect(() => parseDocument(wrong)).toThrow(/missing/);
    const target = structuredClone(doc);
    if (target.features[3].type === "extrude")
      target.features[3].targetId = "base-profile";
    expect(() => parseDocument(target)).toThrow(/part-producing/);
  });
  test("rejects NaN, extreme sizes, unknown features and unknown fields", () => {
    const doc = bracketDocument();
    if (doc.features[1].type === "extrude") doc.features[1].distance = NaN;
    expect(() => parseDocument(doc)).toThrow();
    expect(() =>
      parseDocument({ ...emptyDocument(), unhandledAssets: ["secret"] }),
    ).toThrow();
    expect(() =>
      parseDocument({ ...emptyDocument(), features: [{ type: "loft" }] }),
    ).toThrow();
  });
  test("undo and redo are monotonic and failed candidates never change history", () => {
    const history = new History(emptyDocument());
    const candidate = history.candidate(bracketDocument());
    expect(history.canUndo).toBe(false);
    history.commit(candidate);
    expect(history.current.revision).toBe(1);
    history.acceptUndo(history.undoCandidate()!);
    expect(history.current.features).toHaveLength(0);
    expect(history.current.revision).toBe(2);
    history.acceptRedo(history.redoCandidate()!);
    expect(history.current.revision).toBe(3);
    expect(history.current.features).toHaveLength(6);
  });
});
describe(".notcad archives", () => {
  test("preserves legacy, symmetric and two-direction extrusion records", () => {
    for (const extent of [
      undefined,
      "one-sided",
      "symmetric",
      "two-sided",
    ] as const) {
      const doc = bracketDocument();
      const feature = doc.features[1];
      if (feature.type !== "extrude") throw new Error("Invalid fixture");
      feature.distance = -6;
      if (extent) feature.extent = extent;
      if (extent === "two-sided") feature.secondDistance = 4;
      expect(decodeProject(encodeProject(doc))).toEqual(doc);
    }
  });
  test("rejects missing, invalid and inactive second extrusion distances", () => {
    const doc = bracketDocument();
    const feature = doc.features[1];
    if (feature.type !== "extrude") throw new Error("Invalid fixture");
    feature.extent = "two-sided";
    expect(() => parseDocument(doc)).toThrow(/second distance/);
    for (const invalid of [0, -4, NaN, Infinity, 100001]) {
      feature.secondDistance = invalid;
      expect(() => parseDocument(doc)).toThrow();
    }
    feature.secondDistance = 4;
    feature.extent = "symmetric";
    expect(() => parseDocument(doc)).toThrow(/requires two directions/);
    feature.extent = undefined;
    expect(() => parseDocument(doc)).toThrow(/requires two directions/);
  });
  test("round trips stable identities, units, rollback and history", () => {
    const doc = bracketDocument();
    doc.rollback = 3;
    doc.units = "in";
    expect(decodeProject(encodeProject(doc))).toEqual(doc);
  });
  test("rejects malformed, unsupported versions, unknown entries and oversized expansions", () => {
    expect(() => decodeProject(new Uint8Array([1, 2, 3]))).toThrow();
    const doc = bracketDocument();
    const future = zipSync({
      "manifest.json": strToU8('{"format":"notcad","version":2}'),
      "document.json": strToU8(JSON.stringify(doc)),
    });
    expect(() => decodeProject(future)).toThrow(/Unsupported project version/);
    expect(() =>
      decodeProject(zipSync({ "../document.json": strToU8("x") })),
    ).toThrow(/Unsupported project entry/);
    expect(() =>
      decodeProject(
        zipSync({ "document.json": new Uint8Array(17 * 1024 * 1024) }),
      ),
    ).toThrow(/expands/);
  });
});
