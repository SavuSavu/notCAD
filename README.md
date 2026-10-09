# notCAD

A private, local-first browser CAD application in development. **This is an unreleased foundation, not a completed Onshape replacement.** No public deployment is configured.

Implemented: dimensioned rectangle/circle sketches on three planes; exact one-direction, symmetric and two-direction blind extrusion and global-axis revolution; new/add/remove/intersect operations; all-edge fillets/chamfers; multiple parts; previews; editable history, suppression, reorder checks, rollback, undo/redo; local autosave/recovery; `.notcad` project download/open; STEP and STL export; volume/area and solid validation. PlaneGCS computes profile constraints. OpenCascade creates the solids in a dedicated worker. The responsive UI supports numeric precision entry and touch orbit/pan/zoom.

```sh
npm ci
npm run dev
```

Open the printed local URL with `/notCAD/`. Start a sketch or load the mounting-bracket example. Select a feature and choose **Edit**; double-click also opens it. Press **F** over the viewport to fit, **Ctrl/Cmd+Z** to undo, **Ctrl/Cmd+Shift+Z** to redo, and **Ctrl/Cmd+S** to download the committed project. Dimensions are stored in mm; changing document units converts input/display values.

```sh
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run parity
npm run release:check  # expected to fail until the complete contract passes
```

Browser tests serve the production artifact at `/notCAD/` with no cross-origin isolation headers. The repository workflow uploads CI artifacts only. Runtime dependencies are local assets; the initial kernel download is about 23 MB uncompressed.

Follow [STATUS.md](docs/STATUS.md) to continue implementation, [the capability matrix](docs/parity.json) for outstanding scope, [release policy](docs/PARITY.md) for gates, [architecture](docs/ARCHITECTURE.md) for ownership and data flow, and [fixtures](fixtures/README.md) for analytic examples. Dependency license notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
