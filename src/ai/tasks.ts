import { isGridSearchTask, solveGrid, type GridSearchTask } from "./grid-games";
import { isThreeSearchTask, solveThree, type ThreeSearchTask } from "./three-in-row";
import type { SearchResult } from "./search";

/** A closed, bounded data-only set; the host never executes supplied code. */
export type SearchTask = ThreeSearchTask | GridSearchTask;
export function isSearchTask(value: unknown): value is SearchTask {
  return isThreeSearchTask(value) || isGridSearchTask(value);
}
export function solveSearchTask(value: unknown): SearchResult<number> {
  if (!isSearchTask(value)) throw new Error("Invalid search task");
  return value.kind === "three-in-row" ? solveThree(value) : solveGrid(value);
}
