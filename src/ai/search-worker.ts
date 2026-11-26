import { solveSearchTask } from "./tasks";

// The worker accepts data, not executable callbacks. The caller owns a deadline
// and terminates the worker after a result, an error, or a timeout.
globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  try {
    globalThis.postMessage({ ok: true, result: solveSearchTask(event.data) });
  } catch {
    globalThis.postMessage({ ok: false, error: "Invalid AI search" });
  }
});
