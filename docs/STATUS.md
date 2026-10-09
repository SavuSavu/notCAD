# Implementation status

Last updated: October 9, 2026. **Unreleased. Full capability parity is incomplete.**

The workspace started empty. This session established the application, exact-geometry worker, constrained-profile adapter, transactional documents, initial interface and regression infrastructure. This is progress through milestones 1 and 2; neither milestone is complete. The remaining contract still applies in full.

## Working implementation

- React/TypeScript/Vite workspace with a Three.js viewport, body/sketch picking, editable feature tree, operation panel, orthographic views, responsive history drawer, touch controls and numeric precision entry.
- Single-threaded OpenCascade.js and PlaneGCS WASM assets bundled locally. Exact box/bracket/turned-part fixtures, all-edge fillet/chamfer, solid validity, volume, area, face/solid counts and tessellation.
- Centered rectangle and circle profiles with dimensions and fixed position on XY/XZ/YZ planes. PlaneGCS diagnostics adapter for satisfied, underconstrained, redundant and inconsistent systems; arbitrary sketch entity editing is not exposed yet.
- One-direction, symmetric and two-direction blind extrusion and global-axis revolution; new, add, remove and intersect operations against explicit part IDs. Symmetric distance is the total depth; two directions use independently specified depths. Older one-direction project records remain supported. See [extrusion coverage](EXTRUSION.md). These are subsets of the full tools' modes.
- Incremental history-prefix reuse; transactionally committed regeneration; previews with independent ownership; edits, dependency-aware reordering, suppression, rollback, undo/redo and worker restart. Body/sketch IDs are stable; persistent face/edge provenance and repair are pending.
- Validated version-1 `.notcad` ZIP project files. Transactional IndexedDB autosave with ten recovery snapshots, visible errors and competing-tab protection. Committed projects can always be downloaded while geometry or storage is failing.
- STEP and binary STL export. STEP import exists as a worker-level inspection/round-trip primitive, not a user-facing imported-feature workflow. STL export has a separate binary parser/volume oracle in tests.
- Initial 180-row capability matrix, fixture specifications, build license notices, verified-artifact CI, and a release gate that fails while work remains. The user authorized a Pages test preview from `codex/extrusion-extents` on October 9, 2026; this is separate from a full-parity release.

## Continue from here

1. Finish the documented per-tool and per-mode inventory, Free-account availability audit, retrieval evidence and concrete fixtures. Most matrix mode audits are pending; do not mark the initial inventory complete.
2. Finish foundation verification: add IGES bindings to a reproducible OpenCascade.js build; archive corresponding dependency sources; independently read STEP/IGES outputs; test geometry/memory at scale, real storage exhaustion and migrations. Repeated disposal is tested but is not a memory plateau proof.
3. Extend sketch records to arbitrary entities, user-created constraints, expressions and dimensions. Route solved coordinates into geometry, add pointer/touch drawing, selection modes, conflict highlighting and repair. Current profiles are precisely dimensioned forms.
4. Implement persistent topological provenance/signatures and ambiguity handling before selected-edge fillets/chamfers, face references and further dependent features. Finish extrude/revolve modes and standalone booleans. Add imported assets/reference meshes with ZIP persistence; reject unsupported entities explicitly.
5. Complete milestone 3: remaining solid/surface/curve tools, variables/configurations, sheet metal, frames, routing and local libraries. Acceptance fixture specifications already exist; their runnable workflows mostly do not.
6. Complete milestone 4: assemblies with a separate rigid-body solver, every required mate/relationship, motion, in-context references, exploded views, BOMs and associative drawings/exports. There are no placeholder assembly or drawing controls.
7. Complete cross-browser coverage of every parity row and all seven UI workflows. Record physical iOS Safari/Android Chrome evidence with exact artifact digests; browser profiles do not satisfy that gate.
8. Complete full-release acceptance, exact-artifact smoke tests and retained-artifact rollback. The user separately authorized publishing the current incomplete build as a test preview.

## Verification and local operation

See `docs/verification.json` for the latest recorded engineering checks. Tests are in `tests/`; production output is in ignored `dist/`. Reports/screenshots are in ignored `playwright-report/` and `test-results/`.

Latest continuation: symmetric and two-direction blind extrusion is implemented and checked with 29 passing unit/geometry tests, a passing production build, and 22 passing browser workflows across five profiles. Three desktop instances of the touch-only test are intentionally skipped. Inventory validation passes; the release check remains blocked as expected. `docs/verification.json` records the tested artifact's file hashes. This is local engineering evidence, not full parity or physical-device verification.

On Linux, the browser runner uses Firefox's display backend because its headless backend did not provide WebGL in this environment. It automatically wraps the run in `xvfb-run` when `DISPLAY` is absent. Install browser dependencies with `npx playwright install --with-deps chromium firefox webkit`. In this session Xvfb was extracted without root to `/tmp/notcad-xvfb/extracted`, so local commands used `PATH="/tmp/notcad-xvfb/extracted/usr/bin:$PATH" npm run test:e2e`. This temporary path is not a project dependency. CI installs Xvfb through Playwright's supported Ubuntu dependency setup. See [Playwright CI guidance](https://playwright.dev/docs/ci).

Known limits: one Part Studio per document; 200 history features; 16 MiB project archives; dimensions 0.001–100,000 mm; fixed-position rectangle/circle sketches; global-axis revolve; all-edge finishing; no imported-asset persistence, mesh-reference UI, assembly, drawings, version browser or unsupported format handling beyond explicit rejection. These limitations keep the corresponding parity rows incomplete. No physical devices were accessed.
