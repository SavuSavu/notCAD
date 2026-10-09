# Capability contract and release policy

Target date: **October 9, 2026**. The scope is the supplied built-in Onshape Free CAD capability contract. Exceptions: cloud accounts/collaboration, proprietary vendor formats, and execution of existing FeatureScript custom features. Full desktop and touch editing remains a notCAD requirement even when a source application offers reduced mobile behavior.

`parity.json` contains 180 tracked capability rows with initial mode inventories, sources, reproducible fixture references, acceptance-test identifiers, implementation state, and evidence pointers. **This is a seed inventory, not a completed documentation audit or a parity claim.** Only the initial extrude, revolve and fillet tool pages have been individually reviewed; their audit remains partial. The remaining per-tool modes, Free-tier availability, linked tools, and fixture expansion must be checked against the official documentation before setting `inventoryComplete`.

Baseline sources:

- [Part Studios](https://cad.onshape.com/help/Content/PartStudio/part_studios.htm)
- [Sketch tools](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm)
- [Feature tools](https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm)
- [Assemblies](https://cad.onshape.com/help/Content/Assembly/assembly.htm), [mates](https://cad.onshape.com/help/Content/Assembly/mates.htm), [relations](https://cad.onshape.com/help/Content/Assembly/relations.htm)
- [Drawings](https://cad.onshape.com/help/Content/Drawing/drawings.htm)
- [Extrude](https://cad.onshape.com/help/Content/PartStudio/extrude.htm), [revolve](https://cad.onshape.com/help/Content/PartStudio/revolve.htm), [fillet](https://cad.onshape.com/help/Content/PartStudio/fillet.htm)

Sources were consulted October 9, 2026; the main help indexes showed September 24, 2026 updates. Links may change later; the remaining audit should record retrieved dates, mode lists and source hashes without silently adding future features. Do not change a row to `verified` merely because a related kernel primitive exists. Every documented mode needs an actual UI path and reproducible passing acceptance evidence. Planned test IDs are intentionally distinct from implemented test files.

`npm run parity` checks inventory structure and evidence paths. `npm run release:check` fails unless every row is verified, all mode audits and gates are complete, the exact artifact and source revision are attested, and the data-loss review reports zero defects. Physical iOS Safari and Android Chrome evidence must identify device/OS/browser, tester, date, artifact hash and results. Emulation does not satisfy these gates.

The user explicitly authorized publishing this branch as a test preview on October 9, 2026. CI on `codex/extrusion-extents` builds once, runs unit and browser checks, retains the engineering artifact, and deploys that same `dist/` artifact to `https://savusavu.github.io/notCAD/`. This preview does not pass or bypass the full-parity release check. The existing `main` implementation remains on its branch. Full release still requires all gates, artifact and source attestation, physical-device verification, and a tested rollback procedure. Never rebuild between verification and publishing.
