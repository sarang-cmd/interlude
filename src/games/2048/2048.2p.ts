/** Website-only split-screen match, backed by the shared Game2048Game rules. */
import { Game2048Game } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class Game2048LocalRace extends SplitRaceGame {
  constructor() {
    super("twenty48", () => new Game2048Game());
  }
}
