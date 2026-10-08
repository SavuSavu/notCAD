import { afterEach, expect, it, vi } from "vitest";
import { WorkerClient } from "../src/kernel/client";
import { emptyDocument } from "../src/model/document";
import type { Request, Response } from "../src/kernel/protocol";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: Response }) => void;
  onerror?: () => void;
  terminated = false;
  requests: Request[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: Request) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  respond(request: Request) {
    this.onmessage?.({
      data: {
        id: request.id,
        revision: request.revision,
        ok: true,
        type: "regenerate",
        result: { parts: [], diagnostics: [] },
      },
    });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeWorker.instances = [];
});
it("cancels all pending work, rejects old requests and rebuilds the worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = new WorkerClient();
  const doc = emptyDocument();
  const first = client.request({
    type: "regenerate",
    revision: 0,
    document: doc,
  });
  const rejected = expect(first).rejects.toThrow("cancelled");
  const old = FakeWorker.instances[0];
  client.cancel();
  await rejected;
  expect(old.terminated).toBe(true);
  const next = client.request({
    type: "regenerate",
    revision: 1,
    document: { ...doc, revision: 1 },
  });
  const current = FakeWorker.instances[1];
  old.respond(old.requests[0]);
  current.respond(current.requests[0]);
  expect(await next).toMatchObject({ revision: 1, ok: true });
  client.dispose();
});
it("recovers from crash and timeout while preserving the caller-owned document", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const client = new WorkerClient(),
    doc = emptyDocument();
  const first = client.request({
    type: "regenerate",
    revision: 0,
    document: doc,
  });
  const crash = expect(first).rejects.toThrow("crashed");
  FakeWorker.instances[0].onerror?.();
  await crash;
  const second = client.request({
    type: "regenerate",
    revision: 0,
    document: doc,
  });
  const timeout = expect(second).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(90000);
  await timeout;
  expect(doc.features).toEqual([]);
  expect(FakeWorker.instances).toHaveLength(3);
  client.dispose();
});
it("discards replies with a stale revision or a mismatched operation type", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const client = new WorkerClient();
  try {
    const received: Response[] = [];
    const request = client
      .request({ type: "regenerate", revision: 7, document: emptyDocument() })
      .then((response) => received.push(response));
    const worker = FakeWorker.instances[0],
      sent = worker.requests[0];
    worker.respond({ ...sent, revision: 6 });
    await Promise.resolve();
    expect(received).toEqual([]);
    worker.onmessage?.({
      data: {
        id: sent.id,
        revision: 7,
        ok: true,
        type: "export",
        bytes: new Uint8Array(),
      },
    });
    await Promise.resolve();
    expect(received).toEqual([]);
    worker.respond(sent);
    await request;
    expect(received).toHaveLength(1);
  } finally {
    client.dispose();
  }
});
it("does not retain timers or pending requests when sending throws", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const client = new WorkerClient();
  const send = vi
    .spyOn(FakeWorker.prototype, "postMessage")
    .mockImplementationOnce(() => {
      throw new DOMException("Cannot clone", "DataCloneError");
    });
  try {
    await expect(
      client.request({
        type: "regenerate",
        revision: 0,
        document: emptyDocument(),
      }),
    ).rejects.toThrow("Cannot clone");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    send.mockRestore();
    client.dispose();
  }
});
it("rejects requests after disposal without restarting a closed workspace", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const client = new WorkerClient();
  client.dispose();
  const rejection = expect(
    client.request({
      type: "regenerate",
      revision: 0,
      document: emptyDocument(),
    }),
  ).rejects.toThrow("closed");
  await vi.runAllTimersAsync();
  await rejection;
  expect(FakeWorker.instances).toHaveLength(1);
});
