import { isGridSearchTask, solveGrid, type GridSearchTask } from "./grid-games";
import { isThreeSearchTask, solveThree, type ThreeSearchTask } from "./three-in-row";
import { isBoxesSearchTask, solveBoxes, type BoxesSearchTask } from "./dots-and-boxes";
import type { SearchResult } from "./search";

/** A closed, bounded data-only set; the host never executes supplied code. */
export type SearchTask = ThreeSearchTask | GridSearchTask | BoxesSearchTask;
export function isSearchTask(value: unknown): value is SearchTask {
  return isThreeSearchTask(value) || isGridSearchTask(value) || isBoxesSearchTask(value);
}
export function solveSearchTask(value: unknown): SearchResult<number> {
  if (!isSearchTask(value)) throw new Error("Invalid search task");
  if (value.kind === "three-in-row") return solveThree(value);
  if (value.kind === "dots-and-boxes") return solveBoxes(value);
  return solveGrid(value);
}
