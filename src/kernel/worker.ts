import initOpenCascade from "replicad-opencascadejs";
import ocUrl from "replicad-opencascadejs/wasm?url";
import { init_planegcs_module } from "@salusoft89/planegcs";
import solverUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { setOC } from "replicad";
import { GeometryEngine, inspectStep } from "./engine";
import { solvePrimitives } from "./solver";
import type { KernelRequest, KernelResponse } from "./protocol";

const ready = Promise.all([
  initOpenCascade({ locateFile: () => ocUrl }),
  init_planegcs_module({ locateFile: () => solverUrl }),
]).then(([oc, solver]) => {
  setOC(oc);
  return { engine: new GeometryEngine(solver), solver };
});
let queue = Promise.resolve();
let committedRevision = -1;
self.onmessage = (event: MessageEvent<KernelRequest>) => {
  const request = event.data;
  // Sequential dispatch prevents async import/initialization from racing regeneration.
  queue = queue.then(async () => {
    let response: KernelResponse;
    try {
      const { engine, solver } = await ready;
      const op = request.operation;
      if (op.kind === "export" && request.revision !== committedRevision)
        throw new Error(
          "Export revision no longer matches the committed model.",
        );
      const preview = op.kind === "preview" ? new GeometryEngine(solver) : null;
      let result;
      try {
        result =
          op.kind === "preview"
            ? preview!.regenerate(op.document)
            : op.kind === "regenerate"
              ? engine.regenerate(op.document)
              : op.kind === "export"
                ? engine.export(op.format, op.partId)
                : op.kind === "solve"
                  ? solvePrimitives(solver, op.primitives)
                  : await inspectStep(op.data);
      } finally {
        preview?.dispose();
      }
      if (op.kind === "regenerate") committedRevision = request.revision;
      response = {
        id: request.id,
        revision: request.revision,
        ok: true,
        result,
      };
    } catch (error) {
      response = {
        id: request.id,
        revision: request.revision,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Kernel failed. Check the operation parameters.",
      };
    }
    self.postMessage(response);
  });
};
