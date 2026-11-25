/**
 * Web-only mode registry. Game-specific local modes will be loaded from
 * `*.2p.ts` modules here. No local mode is advertised before implementation.
 */
import type { ArcadeGame, GameMode } from "../games/types";

export function localModesFor(_gameId: string): readonly GameMode[] {
  return [];
}

export async function loadLocalGame(_gameId: string, _modeId: string): Promise<ArcadeGame> {
  throw new Error("Mode unavailable");
}
