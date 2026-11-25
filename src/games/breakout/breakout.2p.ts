/** Website-only split-screen match, backed by the shared BreakoutGame rules. */
import { BreakoutGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class BreakoutLocalRace extends SplitRaceGame {
  constructor() {
    super("breakout", () => new BreakoutGame());
  }
}
