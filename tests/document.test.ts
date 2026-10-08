import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  bracketDocument,
  validateDocument,
  emptyDocument,
} from "../src/model/document";
import { History } from "../src/model/history";
import { decodeProject, encodeProject } from "../src/storage/project";
describe("versioned project validation and history", () => {
  it("round trips feature identifiers, units, suppression and rollback", () => {
    const doc = bracketDocument();
    doc.units = "in";
    doc.rollback = 2;
    doc.features[4].suppressed = true;
    expect(decodeProject(encodeProject(doc))).toEqual(doc);
  });
  it("rejects unsupported versions without modifying the source", () => {
    const doc = { ...emptyDocument(), version: 2 };
    expect(() => validateDocument(doc)).toThrow();
    expect(doc.version).toBe(2);
  });
  it("rejects malformed archives, unexpected content and missing manifest", () => {
    expect(() => decodeProject(new Uint8Array([1, 2, 3]))).toThrow(
      "Cannot open project",
    );
    expect(() =>
      decodeProject(zipSync({ "document.json": strToU8("{}") })),
    ).toThrow("Missing project");
    expect(() => decodeProject(zipSync({ "../escape": strToU8("x") }))).toThrow(
      "Unsupported project entry",
    );
  });
  it("rejects oversized decompressed documents before inflation", () => {
    expect(() =>
      decodeProject(
        zipSync({ "document.json": new Uint8Array(3 * 1024 * 1024) }),
      ),
    ).toThrow("uncompressed size");
  });
  it("rejects nonfinite and degenerate dimensions", () => {
    for (const width of [0, -1, Infinity, NaN]) {
      const doc = bracketDocument();
      const f = doc.features[0];
      if (f.type === "sketch" && f.profile.kind === "rectangle")
        f.profile.width = width;
      expect(() => validateDocument(doc)).toThrow();
    }
  });
  it("rejects duplicate, missing and forward references, and invalid reorder", () => {
    const doc = bracketDocument();
    doc.features[1].id = doc.features[0].id;
    expect(() => validateDocument(doc)).toThrow("Duplicate");
    const reordered = bracketDocument();
    [reordered.features[0], reordered.features[1]] = [
      reordered.features[1],
      reordered.features[0],
    ];
    expect(() => validateDocument(reordered)).toThrow("forward sketch");
  });
  it("preserves monotonic revisions and branches undo history", () => {
    const history = new History(emptyDocument());
    const next = bracketDocument();
    history.commit(next);
    const revision = history.current.revision;
    expect(history.undo().features).toHaveLength(0);
    expect(history.current.revision).toBe(revision + 1);
    expect(history.redo().features).toHaveLength(6);
    expect(history.current.revision).toBe(revision + 2);
    history.undo();
    history.commit({ ...history.current, name: "Branch" });
    expect(history.canRedo).toBe(false);
  });
});
