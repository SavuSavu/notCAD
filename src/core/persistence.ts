import { openDB } from "idb";
import { parseDocument, type CadDocument } from "./model";

export class Autosave {
  private db = openDB("notcad-local-v1", 1, {
    upgrade(db) {
      db.createObjectStore("workspace");
      db.createObjectStore("snapshots");
    },
  });
  private token: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  async restore(): Promise<{
    document: CadDocument | null;
    recovered: boolean;
  }> {
    const db = await this.db;
    const current = await db.get("workspace", "current");
    this.token = current?.token ?? null;
    if (!current) return { document: null, recovered: false };
    try {
      return { document: parseDocument(current.document), recovered: false };
    } catch {
      const snapshots = (await db.getAll("snapshots")).sort(
        (a, b) => b.savedAt - a.savedAt,
      );
      for (const snapshot of snapshots) {
        try {
          return {
            document: parseDocument(snapshot.document),
            recovered: true,
          };
        } catch {
          /* try earlier snapshot */
        }
      }
      throw new Error(
        "Local recovery failed. Open a downloaded .notcad project; existing storage has been preserved.",
      );
    }
  }
  save(document: CadDocument): Promise<void> {
    const snapshot = structuredClone(parseDocument(document));
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const db = await this.db;
        const tx = db.transaction(["workspace", "snapshots"], "readwrite");
        // Observe completion immediately, including synchronous put() failures.
        const done = tx.done;
        void done.catch(() => {});
        try {
          const stored = await tx.objectStore("workspace").get("current");
          if ((stored?.token ?? null) !== this.token) {
            tx.abort();
            await tx.done.catch(() => {});
            throw new Error(
              "Another tab changed this workspace. Download a recovery copy before reloading.",
            );
          }
          const token = crypto.randomUUID();
          const record = {
            token,
            document: snapshot,
            savedAt: Math.max(Date.now(), (stored?.savedAt ?? 0) + 1),
          };
          if (stored)
            await tx.objectStore("snapshots").put(stored, stored.token);
          const backups = await tx.objectStore("snapshots").getAll();
          backups.sort((a, b) => b.savedAt - a.savedAt);
          for (const old of backups.slice(10))
            await tx.objectStore("snapshots").delete(old.token);
          await tx.objectStore("workspace").put(record, "current");
          await done;
          this.token = token;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Already aborted or completed. */
          }
          await done.catch(() => {});
          throw error;
        }
      });
    this.queue = task;
    return task;
  }
  async close() {
    await this.queue.catch(() => {});
    (await this.db).close();
  }
}
