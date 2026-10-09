import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseDocument, type CadDocument } from "./model";

const LIMIT = 16 * 1024 * 1024;
export function encodeProject(document: CadDocument): Uint8Array {
  return zipSync(
    {
      "document.json": strToU8(JSON.stringify(parseDocument(document))),
      "manifest.json": strToU8(
        JSON.stringify({
          format: "notcad",
          version: 1,
          units: "mm",
          assets: [],
          caches: [],
        }),
      ),
    },
    { level: 6 },
  );
}
export function decodeProject(bytes: Uint8Array): CadDocument {
  if (bytes.byteLength > LIMIT)
    throw new Error("Project exceeds the 16 MiB limit of this build.");
  let total = 0,
    count = 0;
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      total += entry.originalSize;
      if (++count > 8 || total > LIMIT)
        throw new Error("Project archive expands beyond the supported limit.");
      if (!["document.json", "manifest.json"].includes(entry.name))
        throw new Error(`Unsupported project entry: ${entry.name}`);
      return true;
    },
  });
  if (!entries["document.json"] || !entries["manifest.json"])
    throw new Error("Missing project manifest or document.");
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  if (manifest.format !== "notcad" || manifest.version !== 1)
    throw new Error(
      "Unsupported project version. The original file has not been changed.",
    );
  if (
    !Array.isArray(manifest.assets) ||
    manifest.assets.length ||
    !Array.isArray(manifest.caches) ||
    manifest.caches.length
  )
    throw new Error(
      "This build cannot open projects with imported assets or geometry caches.",
    );
  return parseDocument(JSON.parse(strFromU8(entries["document.json"])));
}
export function download(data: Blob | Uint8Array, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)]);
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
