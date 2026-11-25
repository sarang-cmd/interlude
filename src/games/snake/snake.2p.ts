/** Website-only split-screen match, backed by the shared SnakeGame rules. */
import { SnakeGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class SnakeLocalRace extends SplitRaceGame {
  constructor() {
    super("snake", () => new SnakeGame());
  }
}
