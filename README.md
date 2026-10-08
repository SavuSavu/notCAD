# notCAD

A private, local browser CAD workspace in development. The first sketch-to-solid workflow runs using exact OpenCascade geometry and PlaneGCS constraints in a Web Worker. This is **not a complete Onshape replacement**. The user has authorized a public preview at [savusavu.github.io/notCAD](https://savusavu.github.io/notCAD/); full parity acceptance remains unfinished. Projects still stay on your device.

Install Node.js 22, then run:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/notCAD/`. Create a rectangle/circle sketch, choose its plane and dimensions, and extrude or revolve it. Multiple solid parts and add/remove/intersect operations are supported. Fillet/chamfer currently affect every edge. Select a history feature to edit, suppress, reorder or delete it; invalid dependencies and failed geometry preserve the committed model. The welcome screen also builds a mechanical bracket example.

Projects stay in IndexedDB on this browser/device. Download `.notcad` projects for portable backups and open them through the file picker. Current projects contain editable history, IDs, units and rollback position. The app supports STEP/STL export; other exchange formats and general geometry imports are unfinished. Touch layouts provide drawers and numeric entry, with physical-device acceptance still pending.

Verify locally:

```sh
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
NOTCAD_HEADED=1 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run npm run test:e2e
```

On platforms without `xvfb-run`, use normal headless tests with `npm run test:e2e` or a graphical desktop with `NOTCAD_HEADED=1`. Some Linux headless Firefox configurations do not create WebGL contexts; use a virtual/display server for the rendering acceptance test. Browser tests serve the already-built `dist/` artifact under `/notCAD/`. CI retains that artifact and publishes the same build to GitHub Pages only after all four browser projects pass on main.

`npm run gate:release` **is expected to fail** while parity, documentation audit, physical devices, independent exchange readers and release evidence remain unfinished. The public preview is explicitly authorized despite these unfinished full-release gates; preview deployment does not declare parity.

See [milestone status](docs/STATUS.md), the [134-row parity register](docs/PARITY.md), [architecture checkpoint](docs/ARCHITECTURE.md), [analytic fixtures](fixtures/analytic.json), and [dependency notices](public/THIRD_PARTY_NOTICES.md). Those records define what is implemented, verified, and still required for later sessions.
