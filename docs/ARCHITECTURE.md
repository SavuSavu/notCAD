# Engineering architecture

React/TypeScript drives a Three.js orthographic viewport. Vite emits the main script, module worker, and two single-threaded WASM binaries below `/notCAD/`. Hash navigation avoids server route fallback requirements. No CDN, backend, account, upload, or telemetry is used by the application.

The dedicated worker initializes OpenCascade.js through the `replicad-opencascadejs` distribution and the typed Replicad geometry adapter. This is exact BREP modeling; meshes are presentation output only. PlaneGCS solves dimensioned rectangle/circle profiles and exposes a typed primitive/diagnostics adapter for future arbitrary sketch entities. Assembly solving is not implemented.

`core/model.ts` validates the entire version-1 document with Zod. Stable feature IDs identify sketches and part-producing features. Dependencies must precede their consumers. Missing references, wrong feature kinds, unknown fields and formats are rejected. Face/edge provenance and reference repair are still required before face-based features can be added safely; transient tessellation hashes must never become persistent references.

`kernel/engine.ts` retains a shape-owning snapshot for each history prefix. Unchanged prefixes are reused; the modified suffix regenerates transactionally. Candidate stages are disposed on failure. Successful candidates replace and dispose the superseded stages. Export uses the last successful worker revision. Preview uses a separate engine and disposes its shapes without altering committed history. The current cache is bounded by the 200-feature document limit, but a geometry-memory budget and long-session plateau tests remain required.

`kernel/client.ts` correlates IDs and revisions, discards unknown/stale responses, and times out after 60 seconds. Cancellation or a worker crash terminates the worker. The application restores the committed document in a fresh worker. A generation token prevents a cancelled response from committing later. There is no shared WASM state between the UI and the worker.

History only accepts regenerated documents. Undo/redo keeps revisions monotonic. Rollback limits active features; suppression removes a feature from evaluation. Suppressing a needed sketch or part fails explicitly, retaining the last committed document. Reordering across dependencies is rejected before regeneration. Body and sketch selection work by stable IDs in the feature tree and viewport.

Projects are ZIP files containing strict `document.json` and `manifest.json`. The initial format has no imported assets or persisted BREP caches. Unknown entries, oversized compressed/expanded input, unsupported versions, unsupported features, and asset-bearing archives are rejected rather than partially opened. Version migration is pending; no older public format exists. The supported size limit is 16 MiB. The manifest records canonical geometry units as mm; display/input units are a document preference.

Autosave writes the current document and the previous recovery snapshot in one IndexedDB transaction, retaining ten previous snapshots. Writes are serialized. A compare-and-swap token catches competing tabs. The visible save indicator only reports success after transaction completion. Download always encodes committed in-memory history, including when storage is unavailable. Browser storage deletion/eviction cannot be prevented: explicit downloads are the portable project copies.

Current exchange: exact STEP export and worker-level STEP import/inspection; binary STL export. A geometry import feature, asset persistence, mesh references, IGES bindings, OBJ, DXF, SVG and drawing PDF remain incomplete. A same-kernel STEP round trip is not independent-reader verification.
