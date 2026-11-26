/** Website-only race; both players receive independently seeded solo games. */
import { PopGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class PopLocalRace extends SplitRaceGame {
  constructor() {
    super("pop", () => new PopGame());
  }
}
