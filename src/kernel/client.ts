import type { Request, Response } from "./protocol";
export class WorkerClient {
  private worker: Worker;
  private nextId = 0;
  private disposed = false;
  private pending = new Map<
    number,
    {
      resolve(value: Response): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
      revision: number;
      type: Request["type"];
    }
  >();
  constructor() {
    this.worker = this.createWorker();
  }
  private createWorker() {
    const worker = new Worker(new URL("./cad.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (worker !== this.worker || this.disposed) return;
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      if (
        event.data.revision !== pending.revision ||
        (event.data.ok && event.data.type !== pending.type)
      )
        return;
      clearTimeout(pending.timer);
      this.pending.delete(event.data.id);
      event.data.ok
        ? pending.resolve(event.data)
        : pending.reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      if (worker === this.worker)
        this.cancel(
          "CAD worker crashed. The committed project is preserved; retry the operation.",
        );
    };
    return worker;
  }
  request(
    request:
      | Omit<Extract<Request, { type: "regenerate" }>, "id">
      | Omit<Extract<Request, { type: "export" }>, "id">
      | Omit<Extract<Request, { type: "roundtrip" }>, "id">,
  ): Promise<Response> {
    if (this.disposed) return Promise.reject(new Error("Workspace closed"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.cancel(
            "CAD operation timed out. The committed project is preserved.",
          ),
        90000,
      );
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        revision: request.revision,
        type: request.type,
      });
      try {
        this.worker.postMessage({ ...request, id });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          error instanceof Error ? error : new Error("Cannot send CAD request"),
        );
      }
    });
  }
  cancel(message = "Operation cancelled. The committed project is preserved.") {
    if (this.disposed) return;
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.worker = this.createWorker();
  }
  dispose() {
    this.disposed = true;
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Workspace closed"));
    }
    this.pending.clear();
  }
}
