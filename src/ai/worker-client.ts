import type { SearchResult } from "./search";
import type { SearchTask } from "./tasks";

export class AIWorkerTimeout extends Error {
  constructor() {
    super("AI search timed out");
    this.name = "AIWorkerTimeout";
  }
}

/** One request per worker. Termination prevents a timed-out search from running on. */
export function runWorker<Request, Result>(
  createWorker: () => Worker,
  request: Request,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("AI search aborted", "AbortError"));
      return;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new AIWorkerTimeout());
      return;
    }
    let worker: Worker;
    try {
      worker = createWorker();
    } catch (error) {
      reject(error);
      return;
    }
    let finished = false;
    const finish = (error: unknown, result?: Result): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", failed);
      worker.terminate();
      if (error) reject(error);
      else resolve(result as Result);
    };
    const abort = (): void => finish(new DOMException("AI search aborted", "AbortError"));
    const failed = (): void => finish(new Error("AI worker failed"));
    const message = (event: MessageEvent<unknown>): void => {
      const reply = event.data;
      if (!reply || typeof reply !== "object" || !("ok" in reply)) {
        finish(new Error("Invalid AI worker response"));
      } else if (reply.ok === true && "result" in reply) {
        finish(null, reply.result as Result);
      } else finish(new Error("AI search failed"));
    };
    const timer = setTimeout(() => finish(new AIWorkerTimeout()), Math.min(10_000, timeoutMs));
    worker.addEventListener("message", message);
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", failed);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(error);
    }
  });
}

export function searchInWorker(
  task: SearchTask,
  timeoutMs = 500,
  signal?: AbortSignal,
): Promise<SearchResult<number>> {
  return runWorker(
    () => new Worker(new URL("./search-worker.ts", import.meta.url), { type: "module" }),
    task,
    timeoutMs,
    signal,
  );
}
