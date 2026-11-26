/** Website-only race; both players receive independently seeded solo games. */
import { SweepGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class SweepLocalRace extends SplitRaceGame {
  constructor() {
    super("sweep", () => new SweepGame());
  }
}
