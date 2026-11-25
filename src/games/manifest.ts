/**
 * Shared game registry — metadata for all eight games plus lazy loaders.
 * Manifest data lives here (not in game modules) so importing the registry
 * never pulls game code into the entry chunk. Only the selected game's
 * chunk is ever fetched.
 */
import type { ArcadeGame, GameManifest } from "./types";

export const SNAKE_MANIFEST: GameManifest = {
  id: "snake",
  name: "SNAKE",
  description: "Grid serpent. Eat, grow, do not bite yourself.",
  controls: "ARROWS STEER · SWIPE ON TOUCH",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const BREAKOUT_MANIFEST: GameManifest = {
  id: "breakout",
  name: "BREAKOUT",
  description: "Brick wall. Angle shots off the paddle. Multiball or nothing.",
  controls: "MOUSE MOVES PADDLE · SPACE LAUNCH · ARROWS NUDGE",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const FLAPPY_MANIFEST: GameManifest = {
  id: "flappy",
  name: "FLAPPER",
  description: "One button. Gravity is undefeated. Thread the pipes.",
  controls: "SPACE / TAP / CLICK — FLAP",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const TWENTY48_MANIFEST: GameManifest = {
  id: "twenty48",
  name: "2048",
  description: "Slide, merge, double. Reach the 2048 tile.",
  controls: "ARROWS SLIDE · U UNDO · SWIPE ON TOUCH",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const PONG_MANIFEST: GameManifest = {
  id: "pong",
  name: "PONG",
  description: "First to the target score. Keep the rally alive.",
  controls: "UP/DOWN OR MOUSE — MOVE PADDLE",
  defaultDifficulty: "regular",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const BLOCKFALL_MANIFEST: GameManifest = {
  id: "blockfall",
  name: "BLOCKFALL",
  description: "Ten columns. Seven pieces. The stack is patient — you should not be.",
  controls: "ARROWS MOVE · UP ROTATE · SPACE HARD DROP · C HOLD",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const ROCKFALL_MANIFEST: GameManifest = {
  id: "rockfall",
  name: "ROCKFALL BELT",
  description: "Inertia flight through a debris field. Split or be split.",
  controls: "LEFT/RIGHT TURN · UP THRUST · SPACE FIRE",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const DASHLINE_MANIFEST: GameManifest = {
  id: "dashline",
  name: "DASHLINE",
  description: "One button. Hold longer, jump higher. The belt never stops.",
  controls: "SPACE / TAP — JUMP (HOLD = HIGHER)",
  defaultDifficulty: "standard",
  supports: ["keyboard", "pointer", "touch", "gamepad"],
};

export const GAME_MANIFESTS: readonly GameManifest[] = [
  SNAKE_MANIFEST,
  BREAKOUT_MANIFEST,
  FLAPPY_MANIFEST,
  TWENTY48_MANIFEST,
  PONG_MANIFEST,
  BLOCKFALL_MANIFEST,
  ROCKFALL_MANIFEST,
  DASHLINE_MANIFEST,
];

export const DEFAULT_GAME_ID = "snake";

export function getManifest(id: string): GameManifest | undefined {
  return GAME_MANIFESTS.find((m) => m.id === id);
}

const loaders: Record<string, () => Promise<ArcadeGame>> = {
  snake: async () => new (await import("./snake/game")).SnakeGame(),
  breakout: async () => new (await import("./breakout/game")).BreakoutGame(),
  flappy: async () => new (await import("./flappy/game")).FlappyGame(),
  twenty48: async () => new (await import("./2048/game")).Game2048Game(),
  pong: async () => new (await import("./pong/game")).PongGame(),
  blockfall: async () => new (await import("./blockfall/game")).BlockfallGame(),
  rockfall: async () => new (await import("./rockfall/game")).RockfallGame(),
  dashline: async () => new (await import("./dashline/game")).DashlineGame(),
};

/** Lazy-load a game implementation. Throws on unknown id. */
export async function loadGame(id: string): Promise<ArcadeGame> {
  const loader = loaders[id];
  if (!loader) throw new Error(`Unknown game: ${id}`);
  return loader();
}

/** Resolve the configured choice to a concrete game id. */
export function resolveGameId(
  choice: string,
  lastPlayed: string | undefined,
  random: () => number = Math.random,
  enabled: readonly string[] = GAME_MANIFESTS.map((entry) => entry.id),
): string {
  const allowed = enabled.filter((id) => !!getManifest(id));
  if (!allowed.length) throw new Error("No games enabled");
  if (choice === "last") {
    return lastPlayed && allowed.includes(lastPlayed) ? lastPlayed : allowed[0]!;
  }
  if (choice === "random") {
    const index = Math.max(0, Math.min(allowed.length - 1, Math.floor(random() * allowed.length)));
    return allowed[index]!;
  }
  return allowed.includes(choice) ? choice : allowed[0]!;
}
