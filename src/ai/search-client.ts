import type { SearchResult } from "./search";
import type { SearchTask } from "./tasks";
import { searchInWorker } from "./worker-client";
import { searchInExtensionFrame } from "./extension-bridge";

/** The extension needs an extension-origin worker host; the website does not. */
export function searchBoard(
  task: SearchTask,
  canvas: HTMLCanvasElement,
  timeoutMs = 2000,
  signal?: AbortSignal,
): Promise<SearchResult<number>> {
  if (__PLATFORM__ === "web") return searchInWorker(task, timeoutMs, signal);
  return searchInExtensionFrame(task, canvas, timeoutMs, signal);
}

/** Existing callers retain their original name. */
export const searchThree = searchBoard;
