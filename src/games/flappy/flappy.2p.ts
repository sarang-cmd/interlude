/** Website-only split-screen match, backed by the shared FlappyGame rules. */
import { FlappyGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class FlappyLocalRace extends SplitRaceGame {
  constructor() {
    super("flappy", () => new FlappyGame());
  }
}
