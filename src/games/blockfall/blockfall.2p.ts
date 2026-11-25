/** Website-only split-screen match, backed by the shared BlockfallGame rules. */
import { BlockfallGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class BlockfallLocalRace extends SplitRaceGame {
  constructor() {
    super("blockfall", () => new BlockfallGame());
  }
}
