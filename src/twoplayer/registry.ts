/** Web-only mode metadata and lazy game-specific implementations. */
import type { ArcadeGame, GameMode } from "../games/types";

const PONG_LOCAL: GameMode = {
  id: "local",
  label: "TWO PLAYERS / SAME DEVICE",
  description: "Play Pong together on one device, with no network connection.",
  players: 2,
  surfaces: ["web"],
};

export function localModesFor(gameId: string): readonly GameMode[] {
  return gameId === "pong" ? [PONG_LOCAL] : [];
}

export async function loadLocalGame(gameId: string, modeId: string): Promise<ArcadeGame> {
  if (gameId === "pong" && modeId === "local") {
    return new (await import("../games/pong/pong.2p")).PongLocalGame();
  }
  throw new Error("Mode unavailable");
}
