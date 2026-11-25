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

export function localModesFor(gameId: string): readonly GameMode[] {
  if (gameId === "pong") return [PONG_LOCAL];
  return isRaceGame(gameId) ? [RACE_LOCAL] : [];
}

export async function loadLocalGame(gameId: string, modeId: string): Promise<ArcadeGame> {
  if (modeId !== "local") throw new Error("Mode unavailable");
  switch (gameId) {
    case "pong":
      return new (await import("../games/pong/pong.2p")).PongLocalGame();
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
