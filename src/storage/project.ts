import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { validateDocument, type Document } from "../model/document";
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export function encodeProject(doc: Document): Uint8Array {
  const json = strToU8(JSON.stringify(validateDocument(doc)));
  if (json.byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("Project exceeds the supported document size");
  return zipSync(
    {
      "document.json": json,
      "manifest.json": strToU8(
        JSON.stringify({ format: "notcad", version: 1 }),
      ),
    },
    { level: 6 },
  );
}
export function decodeProject(bytes: Uint8Array): Document {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("Project exceeds the 8 MiB archive limit");
  try {
    const names = new Set<string>();
    const entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!["document.json", "manifest.json"].includes(entry.name))
          throw new Error(`Unsupported project entry: ${entry.name}`);
        if (names.has(entry.name))
          throw new Error(`Duplicate project entry: ${entry.name}`);
        names.add(entry.name);
        if (
          entry.originalSize >
          (entry.name === "document.json" ? MAX_DOCUMENT_BYTES : 1024)
        )
          throw new Error("Project entry exceeds the uncompressed size limit");
        return true;
      },
    });
    if (!entries["document.json"] || !entries["manifest.json"])
      throw new Error("Missing project manifest or document");
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
    if (manifest.format !== "notcad" || manifest.version !== 1)
      throw new Error("Unsupported project format version");
    return validateDocument(JSON.parse(strFromU8(entries["document.json"])));
  } catch (error) {
    throw new Error(
      `Cannot open project: ${error instanceof Error ? error.message : "invalid ZIP"}`,
    );
  }
}
export function download(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: mime }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function filename(name: string) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 100) || "project";
}
