import initOC from "replicad-opencascadejs";
import ocWasm from "replicad-opencascadejs/wasm?url";
import { init_planegcs_module } from "@salusoft89/planegcs";
import gcsWasm from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { Engine } from "./engine";
import type { Request, Response } from "./protocol";
const engine = Promise.all([
  initOC({ locateFile: () => ocWasm }),
  init_planegcs_module({ locateFile: () => gcsWasm }),
]).then(([oc, gcs]) => new Engine(oc, gcs));
// Serialize requests; each document is validated again at the worker boundary.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(async () => {
    const request = event.data;
    let response: Response;
    try {
      const kernel = await engine;
      if (request.type === "regenerate")
        response = {
          id: request.id,
          revision: request.revision,
          ok: true,
          type: request.type,
          result: kernel.regenerate(request.document),
        };
      else if (request.type === "export")
        response = {
          id: request.id,
          revision: request.revision,
          ok: true,
          type: request.type,
          bytes: kernel.export(request.document, request.format),
        };
      else
        response = {
          id: request.id,
          revision: request.revision,
          ok: true,
          type: request.type,
          volumes: kernel.stepRoundtrip(request.document),
        };
    } catch (error) {
      response = {
        id: request.id,
        revision: request.revision,
        ok: false,
        error: error instanceof Error ? error.message : "CAD kernel failed",
      };
    }
    self.postMessage(response);
  });
};
