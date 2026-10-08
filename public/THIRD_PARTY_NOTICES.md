# Third-party dependencies

notCAD bundles unmodified dependency WASM/JavaScript. Versions and archive integrity hashes are pinned in `package-lock.json` in the application source. Build source is available in the notCAD repository; library source links are below. Full dependency license texts are in `licenses/` alongside this notice.

| Package | Version | License | Source |
|---|---|---|---|
| replicad-opencascadejs (OpenCascade.js custom single-threaded build) | 1.1.0 | LGPL-2.1-only | https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1/packages/replicad-opencascadejs |
| OpenCascade.js binding generator | upstream build reference | See upstream notices | https://github.com/donalffons/opencascade.js |
| Open CASCADE Technology | bundled by the kernel package | LGPL with OCCT exception; verify exact upstream source release before publication | https://github.com/Open-Cascade-SAS/OCCT |
| @salusoft89/planegcs | 1.3.0 | LGPL-2.0-or-later | https://github.com/Salusoft89/planegcs |
| Three.js | 0.180.0 | MIT | https://github.com/mrdoob/three.js/tree/r180 |
| React / React DOM | 19.2.0 | MIT | https://github.com/facebook/react/tree/v19.2.0 |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| Zod | 4.1.12 | MIT | https://github.com/colinhacks/zod |

Kernel and solver are loaded as separate local WASM assets. No multithreaded WASM, SharedArrayBuffer, CDN, account, backend, or telemetry is used. The Replicad modeling library is not used; notCAD calls the OpenCascade bindings directly.

Before public distribution, complete the exact OCCT source/build provenance and license-exception audit, retain corresponding source/build instructions, and provide the complete notices in the release artifact. Publication remains blocked while this audit and CAD parity are unfinished.
