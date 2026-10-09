# Extrusion extent coverage

Implemented October 9, 2026. The extrusion capability remains **partial**.

The feature editor exposes three blind extents for rectangle and circle profiles on XY, XZ and YZ planes:

| Extent | Depth input | Ends relative to the sketch plane |
| --- | --- | --- |
| One direction | Signed distance `d` | `0` to `d` |
| Symmetric | Total distance `d` | `-d/2` to `d/2` |
| Two directions | Signed first distance `d`, positive second distance `s` | `-sign(d) × s` to `d` |

Distances are measured along the sketch normal, including the negative Y normal of XZ. The sketch's plane offset applies to both ends. Negative first distances reverse the two-direction extrusion. Symmetric negative distances describe the same span as their positive magnitude. Document units convert both depth fields; persisted dimensions remain millimeters.

Geometry builds a single prism spanning the endpoints, then applies the selected new/add/remove/intersect operation. This avoids joining two half-solids at the sketch plane. The existing transaction, preview, history and export paths own the resulting solid.

Version-1 records gain optional `extent` and `secondDistance` fields. An absent extent retains the legacy one-direction behavior, without modifying the archive on read. The parser rejects missing or nonpositive second distances in two-direction mode, and rejects second distances attached to other extents. Switching away from two directions removes the inactive field. Older builds reject the new fields rather than silently changing the geometry.

## Evidence

- `tests/kernel.test.ts`: signed normal bounds, plane offsets, analytic volumes and six-face/one-solid topology for all three planes and both distance signs; circular two-direction Boolean operations and upstream radius edits.
- `tests/document.test.ts`: exact project round trips for legacy and new extent records; invalid and inactive second-distance rejection.
- `tests/e2e/workflow.spec.ts`: symmetric preview/apply; two-direction editing; undo/redo; inch input conversion; autosave/reload; project download/open; switching back to one direction.

## Documentation review and remaining scope

Reviewed the official [Onshape Extrude documentation](https://cad.onshape.com/help/Content/PartStudio/extrude.htm) on October 9, 2026. It describes symmetric extrusion for blind and through-all ends, plus independent second-end conditions. This implementation covers blind ends only. Surface/thin extrusion, other end conditions, draft, direction references, starting offsets, merge scope and manipulators remain unimplemented. The complete mode inventory and Free-account audit remain open; these tests do not close the extrusion parity row.
