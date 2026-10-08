import { validateDocument, type Document } from "../model/document";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notcad", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recovery");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Cannot open local storage"));
    request.onblocked = () =>
      reject(new Error("Local storage is blocked by another workspace"));
  });
}
export async function saveLocal(doc: Document): Promise<void> {
  const validated = validateDocument(doc),
    db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("recovery", "readwrite"),
        store = transaction.objectStore("recovery");
      const previous = store.get("latest");
      previous.onsuccess = () => {
        try {
          if (previous.result) store.put(previous.result, "previous");
          store.put(validated, "latest");
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("Local save failed; download a recovery copy"),
        );
    });
  } finally {
    db.close();
  }
}
export async function loadLocal(
  key: "latest" | "previous" = "latest",
): Promise<Document | null> {
  const db = await openDB();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction("recovery", "readonly");
      const request = transaction.objectStore("recovery").get(key);
      let result: unknown;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error ?? new Error("Cannot read recovery snapshot"));
    });
    return value == null ? null : validateDocument(value);
  } finally {
    db.close();
  }
}
