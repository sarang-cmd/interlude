import { solveThree, type ThreeSearchTask } from "./three-in-row";

// The worker accepts data, not executable callbacks. The caller owns a deadline
// and terminates the worker after a result, an error, or a timeout.
globalThis.addEventListener("message", (event: MessageEvent<ThreeSearchTask>) => {
  try {
    globalThis.postMessage({ ok: true, result: solveThree(event.data) });
  } catch {
    globalThis.postMessage({ ok: false, error: "Invalid AI search" });
  }
});
