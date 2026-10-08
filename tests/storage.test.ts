import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore, IDBTransaction } from "fake-indexeddb";
import { loadLocal, saveLocal } from "../src/storage/autosave";
import { bracketDocument } from "../src/model/document";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
describe("transactional local recovery", () => {
  it("preserves the previous committed document and latest save", async () => {
    const first = bracketDocument(),
      second = { ...first, name: "Updated", revision: 1 };
    await saveLocal(first);
    await saveLocal(second);
    expect(await loadLocal()).toEqual(second);
    expect(await loadLocal("previous")).toEqual(first);
  });
  it("keeps the last committed snapshot after quota exhaustion", async () => {
    const first = bracketDocument();
    await saveLocal(first);
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
    await expect(saveLocal({ ...first, name: "Cannot fit" })).rejects.toThrow(
      "Quota exceeded",
    );
    put.mockRestore();
    expect(await loadLocal()).toEqual(first);
    expect(await loadLocal("previous")).toBeNull();
  });
  it("preserves both snapshots if a write transaction is interrupted", async () => {
    const first = bracketDocument();
    await saveLocal(first);
    await saveLocal({ ...first, name: "Second" });
    const original = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        const request = original.apply(this, args);
        this.transaction.abort();
        return request;
      });
    await expect(
      saveLocal({ ...first, name: "Interrupted" }),
    ).rejects.toThrow();
    put.mockRestore();
    expect((await loadLocal())?.name).toBe("Second");
    expect(await loadLocal("previous")).toEqual(first);
  });
});
