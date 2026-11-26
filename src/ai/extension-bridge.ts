import type { SearchResult } from "./search";
import type { SearchTask } from "./tasks";
import { AIWorkerTimeout } from "./worker-client";

/**
 * A content script shares the chat page's origin for Worker construction. A
 * short-lived extension-origin frame owns the dedicated worker instead. Only a
 * private MessagePort crosses the boundary; no chat DOM or text is sent.
 */
export function searchInExtensionFrame(
  task: SearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<SearchResult<number>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("AI search aborted", "AbortError"));
      return;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new AIWorkerTimeout());
      return;
    }
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.src = chrome.runtime.getURL("ai-worker-host.html");
    const channel = new MessageChannel();
    let finished = false;
    const finish = (error: unknown, result?: SearchResult<number>): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      frame.removeEventListener("load", load);
      frame.removeEventListener("error", failed);
      channel.port1.close();
      channel.port2.close();
      frame.remove();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = (): void => finish(new DOMException("AI search aborted", "AbortError"));
    const failed = (): void => finish(new Error("AI worker host failed"));
    const load = (): void => {
      try {
        if (!frame.contentWindow) throw new Error("AI worker host missing");
        // getURL has a trailing slash; target only this extension's origin.
        const origin = chrome.runtime.getURL("").replace(/\/$/, "");
        frame.contentWindow.postMessage({ kind: "interlude-ai-port" }, origin, [channel.port2]);
        channel.port1.postMessage(task);
      } catch (error) {
        finish(error);
      }
    };
    channel.port1.onmessage = (event: MessageEvent<unknown>): void => {
      const reply = event.data;
      if (
        reply &&
        typeof reply === "object" &&
        "ok" in reply &&
        reply.ok === true &&
        "result" in reply
      )
        finish(null, reply.result as SearchResult<number>);
      else finish(new Error("AI worker host rejected search"));
    };
    channel.port1.onmessageerror = failed;
    const timer = setTimeout(() => finish(new AIWorkerTimeout()), Math.min(10_000, timeoutMs));
    signal?.addEventListener("abort", abort, { once: true });
    frame.addEventListener("load", load, { once: true });
    frame.addEventListener("error", failed, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    // The closed cabinet shadow root keeps the private frame out of the chat UI.
    // Options previews use an extension document instead of a shadow root.
    const root = canvas.getRootNode();
    (root instanceof ShadowRoot ? root : document.body).append(frame);
  });
}
