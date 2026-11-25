/** Website-only split-screen match, backed by the shared DashlineGame rules. */
import { DashlineGame } from "./game";
import { SplitRaceGame } from "../../twoplayer/split-race";

export class DashlineLocalRace extends SplitRaceGame {
  constructor() {
    super("dashline", () => new DashlineGame());
  }
}
