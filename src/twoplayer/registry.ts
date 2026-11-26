/** Web-only mode metadata and lazy game-specific implementations. */
import type { ArcadeGame, GameMode } from "../games/types";
import { isRaceGame } from "./race-settings";

const PONG_LOCAL: GameMode = {
  id: "local",
  label: "TWO PLAYERS / SAME DEVICE",
  description: "Play Pong together on one device, with no network connection.",
  players: 2,
  surfaces: ["web"],
};
const RACE_LOCAL: GameMode = {
  id: "local",
  label: "TWO PLAYERS / SPLIT SCREEN",
  description: "Race on two seeded boards on one device. Match data stays in this browser.",
  players: 2,
  surfaces: ["web"],
};

const COOP_2048: GameMode = {
  id: "coop",
  label: "TWO PLAYERS / SHARED BOARD CO-OP",
  description: "Take turns on one 2048 board and reach the target together.",
  players: 2,
  surfaces: ["web"],
};

const TICTACTOE_LOCAL: GameMode = {
  id: "local",
  label: "TWO PLAYERS / SHARED BOARD",
  description:
    "Take turns on one device, sharing the controls. Local matches do not change solo scores.",
  players: 2,
  surfaces: ["web"],
};

export function localModesFor(gameId: string): readonly GameMode[] {
  if (gameId === "pong") return [PONG_LOCAL];
  if (["tictactoe", "dropfour", "flipdisc", "dotsboxes"].includes(gameId)) return [TICTACTOE_LOCAL];
  if (gameId === "twenty48") return [RACE_LOCAL, COOP_2048];
  return isRaceGame(gameId) ? [RACE_LOCAL] : [];
}

export async function loadLocalGame(gameId: string, modeId: string): Promise<ArcadeGame> {
  if (gameId === "twenty48" && modeId === "coop") {
    return new (await import("../games/2048/coop.2p")).Coop2048Game();
  }
  if (modeId !== "local") throw new Error("Mode unavailable");
  switch (gameId) {
    case "pong":
      return new (await import("../games/pong/pong.2p")).PongLocalGame();
    case "tictactoe":
      return new (await import("../games/tictactoe/tictactoe.2p")).TicTacToeLocalGame();
    case "dropfour":
      return new (await import("../games/grid-duel/grid.2p")).LocalGridGame("drop-four");
    case "flipdisc":
      return new (await import("../games/grid-duel/grid.2p")).LocalGridGame("flip-disc");
    case "dotsboxes":
      return new (await import("../games/dotsboxes/dotsboxes.2p")).DotsBoxesLocalGame();
    case "snake":
      return new (await import("../games/snake/snake.2p")).SnakeLocalRace();
    case "breakout":
      return new (await import("../games/breakout/breakout.2p")).BreakoutLocalRace();
    case "flappy":
      return new (await import("../games/flappy/flappy.2p")).FlappyLocalRace();
    case "twenty48":
      return new (await import("../games/2048/2048.2p")).Game2048LocalRace();
    case "blockfall":
      return new (await import("../games/blockfall/blockfall.2p")).BlockfallLocalRace();
    case "rockfall":
      return new (await import("../games/rockfall/rockfall.2p")).RockfallLocalRace();
    case "dashline":
      return new (await import("../games/dashline/dashline.2p")).DashlineLocalRace();
    default:
      throw new Error("Mode unavailable");
  }
}
