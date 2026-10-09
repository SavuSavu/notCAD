import type { CadDocument } from "../core/model";
import type { KernelResponse, ModelResult, Operation } from "./protocol";

type Pending = {
  revision: number;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class KernelClient {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  constructor(
    private factory = () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  ) {
    this.worker = this.create();
  }
  private create() {
    const worker = this.factory();
    worker.onmessage = (event: MessageEvent<KernelResponse>) => {
      const message = event.data,
        pending = this.pending.get(message.id);
      if (!pending || message.revision !== pending.revision) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error));
    };
    worker.onerror = () =>
      this.reset(
        "Geometry worker stopped. Your committed document is preserved; use Restart geometry.",
      );
    worker.onmessageerror = () =>
      this.reset("Geometry response could not be read. Use Restart geometry.");
    return worker;
  }
  request<T>(operation: Operation, revision: number): Promise<T> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.reset(
            "Geometry operation timed out. Your committed document is preserved; use Restart geometry.",
          ),
        60000,
      );
      this.pending.set(id, {
        revision,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.worker.postMessage({ id, revision, operation });
    });
  }
  regenerate(document: CadDocument) {
    return this.request<ModelResult>(
      { kind: "regenerate", document },
      document.revision,
    );
  }
  reset(reason = "Operation cancelled. Committed model preserved.") {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
    this.worker = this.create();
  }
  dispose() {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Workspace closed."));
    }
    this.pending.clear();
  }
}
