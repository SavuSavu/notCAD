import { afterEach, expect, test, vi } from "vitest";
import { KernelClient } from "../src/kernel/client";
import { emptyDocument } from "../src/core/model";
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: unknown[] = [];
  terminate = vi.fn();
  postMessage(message: unknown) {
    this.messages.push(message);
  }
}
afterEach(() => vi.useRealTimers());
test("discards unknown request IDs and stale revisions", async () => {
  const worker = new FakeWorker(),
    client = new KernelClient(() => worker as unknown as Worker);
  const doc = emptyDocument(),
    request = client.regenerate(doc),
    done = vi.fn();
  void request.then(done);
  worker.onmessage!({
    data: { id: 1, revision: 99, ok: true, result: { bad: true } },
  });
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  worker.onmessage!({
    data: { id: 99, revision: 0, ok: true, result: { bad: true } },
  });
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  worker.onmessage!({
    data: { id: 1, revision: 0, ok: true, result: { parts: [] } },
  });
  await expect(request).resolves.toEqual({ parts: [] });
  client.dispose();
});
test("cancellation rejects pending work, terminates the worker and accepts recovery", async () => {
  const workers: FakeWorker[] = [];
  const client = new KernelClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  const pending = client.regenerate(emptyDocument()),
    rejected = expect(pending).rejects.toThrow(/cancelled/);
  client.reset();
  await rejected;
  expect(workers[0].terminate).toHaveBeenCalled();
  const recovery = client.regenerate(emptyDocument());
  workers[1].onmessage!({
    data: { id: 2, revision: 0, ok: true, result: { parts: [] } },
  });
  await expect(recovery).resolves.toEqual({ parts: [] });
  client.dispose();
});
test("worker timeout frees the old worker and does not leave unresolved requests", async () => {
  vi.useFakeTimers();
  const worker = new FakeWorker(),
    client = new KernelClient(() => worker as unknown as Worker);
  const pending = client.regenerate(emptyDocument()),
    rejected = expect(pending).rejects.toThrow(/timed out/);
  vi.advanceTimersByTime(60000);
  await rejected;
  expect(worker.terminate).toHaveBeenCalled();
  client.dispose();
});
