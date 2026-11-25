/** Website-only split-screen match, backed by the shared RockfallGame rules. */
import { RockfallGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class RockfallLocalRace extends SplitRaceGame {
  constructor() {
    super("rockfall", () => new RockfallGame());
  }
}
