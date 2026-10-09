# Dependency notices and kernel source provenance

Versions and package integrity hashes are pinned by `package-lock.json`. No dependency WASM binary is modified in this build. `npm ci` reproduces the package inputs. The following source rebuild documentation is provided for continuing kernel work; **independent WASM rebuild reproducibility is not yet verified and remains a release gate**.

| Dependency | Version | License / upstream |
| --- | --- | --- |
| OpenCascade.js distribution (`replicad-opencascadejs`) | 1.1.0 | LGPL-2.1-only package; Open CASCADE Technology has its own LGPL-2.1 exception terms. [OpenCascade.js](https://github.com/donalffons/opencascade.js), [Replicad source](https://github.com/sgenoud/replicad) |
| Replicad | 1.1.0 | MIT; [source](https://github.com/sgenoud/replicad) |
| PlaneGCS wrapper (`@salusoft89/planegcs`) | 1.3.0 | Package metadata LGPL-2.0-or-later; supplied LICENSE text is LGPL-2.1. Based on FreeCAD PlaneGCS; [source and rebuild instructions](https://github.com/Salusoft89/planegcs) |
| React / React DOM | 19.3.0 | MIT; https://github.com/facebook/react |
| Three.js | 0.186.1 | MIT; https://github.com/mrdoob/three.js |
| fflate | 0.8.3 | MIT; https://github.com/101arrowz/fflate |
| idb | 8.0.4 | ISC; https://github.com/jakearchibald/idb |
| Zod | 4.6.5 | MIT; https://github.com/colinhacks/zod |

The build copies installed runtime license texts into `dist/licenses/`. Distribution must preserve upstream notices and provide the required corresponding library source and relinking/replacement materials. Complete the source archive/exception audit before public release.

The kernel package records git head `e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`. Its build scripts use `ytt`, a generated `custom_build_single.yml`, and `ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded`. Retain the exact upstream source and pin the container digest when extending bindings. Current bindings include STEP but **do not include an IGES reader/writer**. Add and verify those bindings before marking IGES supported.

PlaneGCS documents a Docker/Emscripten build (`build:docker`, `build:bindings`, `build:wasm`) and a separate upstream FreeCAD update step. Keep the FreeCAD revision fixed for reproducibility. Build single-threaded WASM so Pages does not require cross-origin isolation.
