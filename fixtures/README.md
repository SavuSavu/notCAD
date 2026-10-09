# Fixture corpus

Analytic dimensions use millimeters. `src/core/model.ts:bracketDocument` is the executable bracket generator; tests build the same design through the real UI. The following specifications are acceptance targets, not claims of implementation.

| ID | Reproducible construction | Acceptance oracle | State |
| --- | --- | --- | --- |
| box | Centered 60 × 40 rectangle on XY, extrude 6 | 14,400 mm³; 6 faces; 1 solid; area 6,000 mm² | Executable kernel test |
| extrusion-extents | 60 × 40 rectangle at normal offset 12 on XY/XZ/YZ; first depth ±6; symmetric or second depth 4 | Symmetric: 14,400 mm³ spanning normal offsets 9–15; two directions: 24,000 mm³ spanning 8–18 or 6–16; 6 faces and 1 solid | Executable kernel tests; extent editing/save/open UI workflow |
| bracket | Box above; 60 × 6 rectangle centered at (0,17) on offset 6, add 34; radius 5 circle at (0,-3), remove 6 | 26,168.76110196153 mm³; valid single solid; width edit 60→80 adds 4,800 mm³ | Executable kernel and UI tests |
| turned-component | XZ rectangle centered at (20,0), 10 × 20, revolve 360° about global Z | π(25²−15²)20 mm³ | Kernel test; UI workflow pending |
| sketch-diagnostics | One fixed origin and one free point; add independent X/Y dimensions, then duplicate or conflict X | 2 DOF → 0; solved coordinates (20,0); redundant/inconsistent diagnostics | Executable solver test; arbitrary sketch UI pending |
| lofted-enclosure | Rounded 80 × 50 and 60 × 40 profiles at Z=0 and Z=60; loft, shell 2, fillet 3 | Valid wall thickness and guide continuity; compare independent exact reader | Pending |
| sheet-metal-enclosure | 100 × 80 base, thickness 1.5, four 30 mm flanges, radius 2, K=0.4 | Fold/flat association; bend allowances θ(R+Kt); four bend table rows | Pending |
| frame | 1000 × 600 × 500 rectangular frame, 25 × 25 × 2 square tube; miter horizontal corners | Twelve members, analytic lengths and cut angles; cut list updates after size edit | Pending |
| articulated-assembly | Ground 100 mm link, revolute 80 mm link, slider carriage; 0–90° limit and 2:1 gear relation | Expected DOF and endpoint trajectories; limit compliance; interference fixtures | Pending |
| dimensioned-drawing | A3 sheet, bracket front/top/right/isometric views, center marks, hole diameter, section and detail | Views and annotations update after 60→80 width edit; vector PDF and DXF | Pending |
| local-project | Bracket archive; alter revision and units, truncate ZIP, future version, corrupt snapshot | Stable IDs; exact history; rejection preserves original; recovery snapshot | Executable unit tests; migrations pending |
| exchange-corpus | Box, bracket, cylinder, open surface, invalid file, inch-authored solid, closed and open meshes | Independent readers per format; explicit reference-mesh semantics | STEP same-kernel round trip; independent STL volume parser; rest pending |
| device-workflow | Create bracket with touch numeric input, change dimensions, save/open/export after reload | Production WASM without COOP/COEP; no external requests; physical file handling | Browser automation; physical verification pending |

Numerical policy: kernel-coordinate comparisons use `max(1e-6 mm, 1e-8 × characteristic length)`; volume/area use `max(1e-6 in mm-based units, 1e-8 × expected value)`. Existing small fixtures use stricter decimal assertions. Mesh tolerances are separate: viewport 0.05 mm and 0.15 rad; STL export 0.02 mm and 0.1 rad. Faceted volume comparisons must account for that approximation. Geometry currently accepts dimensions 0.001–100,000 mm and coordinates within ±100,000 mm. Large/small scale stress coverage is still required.
