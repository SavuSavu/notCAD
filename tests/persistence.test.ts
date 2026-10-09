import "fake-indexeddb/auto";
import { openDB, deleteDB } from "idb";
import { afterEach, expect, test } from "vitest";
import { Autosave } from "../src/core/persistence";
import { bracketDocument, emptyDocument } from "../src/core/model";

const stores: Autosave[] = [];
const store = () => {
  const s = new Autosave();
  stores.push(s);
  return s;
};
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.close()));
  await deleteDB("notcad-local-v1");
});
test("serializes rapid autosaves and recovers the latest committed revision", async () => {
  const s = store();
  await s.restore();
  const doc = bracketDocument();
  await Promise.all(
    Array.from({ length: 15 }, (_, revision) => s.save({ ...doc, revision })),
  );
  const restored = await store().restore();
  expect(restored.document?.revision).toBe(14);
  const db = await openDB("notcad-local-v1");
  expect(await db.count("snapshots")).toBe(10);
  db.close();
});
test("recovers an older valid snapshot if the current record is corrupt", async () => {
  const s = store();
  await s.restore();
  const doc = bracketDocument();
  await s.save(doc);
  await s.save({ ...doc, revision: 1 });
  const db = await openDB("notcad-local-v1");
  await db.put(
    "workspace",
    { token: "corrupt", document: { bad: true } },
    "current",
  );
  db.close();
  const restored = await store().restore();
  expect(restored.recovered).toBe(true);
  expect(restored.document).toEqual(doc);
});
test("prevents another tab from silently overwriting local work", async () => {
  const a = store(),
    b = store();
  await a.restore();
  await b.restore();
  await a.save(bracketDocument());
  await expect(b.save(emptyDocument())).rejects.toThrow(/Another tab/);
  expect((await store().restore()).document?.features).toHaveLength(6);
});
test("an aborted transaction preserves the committed record", async () => {
  const s = store();
  await s.restore();
  await s.save(bracketDocument());
  const db = await openDB("notcad-local-v1"),
    tx = db.transaction("workspace", "readwrite");
  await tx.store.put({ document: emptyDocument() }, "current");
  tx.abort();
  await tx.done.catch(() => {});
  db.close();
  expect((await store().restore()).document?.features).toHaveLength(6);
});
