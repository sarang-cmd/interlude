/** Website-only race; both players receive independently seeded solo games. */
import { SlideGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class SlideLocalRace extends SplitRaceGame {
  constructor() {
    super("slide", () => new SlideGame());
  }
}
