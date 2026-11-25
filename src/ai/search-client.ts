import type { SearchResult } from "./search";
import type { ThreeSearchTask } from "./three-in-row";
import { searchInWorker } from "./worker-client";
import { searchInExtensionFrame } from "./extension-bridge";

/** The extension needs an extension-origin worker host; the website does not. */
export function searchThree(
  task: ThreeSearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs = 2000,
  signal?: AbortSignal,
): Promise<SearchResult<number>> {
  if (__PLATFORM__ === "web") return searchInWorker(task, timeoutMs, signal);
  return searchInExtensionFrame(task, canvas, timeoutMs, signal);
}
