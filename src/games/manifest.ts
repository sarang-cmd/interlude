/** Shared game metadata and lazy loaders for both surfaces. */
import { PLATFORM } from "../platform";
import { playerOneBindings } from "./catalog";
import type { ArcadeGame, GameManifest, GameMode, GameSurface, GameSupport } from "./types";

const BOTH: readonly GameSurface[] = ["extension", "web"];
const INPUTS: readonly GameSupport[] = ["keyboard", "pointer", "touch", "gamepad"];
const SOLO: GameMode = {
  id: "solo",
  label: "SOLO",
  description: "Play one run on your own.",
  players: 1,
  surfaces: BOTH,
};
const CPU: GameMode = {
  id: "cpu",
  label: "VS CPU",
  description: "Play a match against the machine.",
  players: 1,
  surfaces: BOTH,
};
const common = { supports: INPUTS, inputs: INPUTS, surfaces: BOTH, stateSaving: false } as const;

export const SNAKE_MANIFEST: GameManifest = {
  ...common,
  id: "snake",
  name: "SNAKE",
  description: "Grid serpent. Eat, grow, do not bite yourself.",
  controls: "ARROWS STEER · SWIPE ON TOUCH",
  defaultDifficulty: "standard",
  category: "arcade",
  runLength: "1 to 5 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("snake"),
};

export const BREAKOUT_MANIFEST: GameManifest = {
  ...common,
  id: "breakout",
  name: "BREAKOUT",
  description: "Brick wall. Angle shots off the paddle. Multiball or nothing.",
  controls: "MOUSE MOVES PADDLE · SPACE LAUNCH · ARROWS NUDGE",
  defaultDifficulty: "standard",
  category: "arcade",
  runLength: "2 to 5 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("breakout"),
};

export const FLAPPY_MANIFEST: GameManifest = {
  ...common,
  id: "flappy",
  name: "FLAPPER",
  description: "One button. Thread the pipes.",
  controls: "SPACE / TAP / CLICK · FLAP",
  defaultDifficulty: "standard",
  category: "arcade",
  runLength: "Under 3 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("flappy"),
};

export const TWENTY48_MANIFEST: GameManifest = {
  ...common,
  id: "twenty48",
  name: "2048",
  description: "Slide, merge, double. Reach the 2048 tile.",
  controls: "ARROWS SLIDE · U UNDO · SWIPE ON TOUCH",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "5 to 15 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("twenty48"),
};

export const PONG_MANIFEST: GameManifest = {
  ...common,
  id: "pong",
  name: "PONG",
  description: "First to the target score. Keep the rally alive.",
  controls: "UP/DOWN OR MOUSE · MOVE PADDLE",
  defaultDifficulty: "regular",
  category: "arcade",
  runLength: "1 to 3 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("pong"),
};

export const BLOCKFALL_MANIFEST: GameManifest = {
  ...common,
  id: "blockfall",
  name: "BLOCKFALL",
  description: "Ten columns. Seven pieces. Clear the stack.",
  controls: "ARROWS MOVE · UP ROTATE · SPACE HARD DROP · C HOLD",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "2 to 10 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("blockfall"),
};

export const ROCKFALL_MANIFEST: GameManifest = {
  ...common,
  id: "rockfall",
  name: "ROCKFALL BELT",
  description: "Inertia flight through a debris field. Split the rocks.",
  controls: "LEFT/RIGHT TURN · UP THRUST · SPACE FIRE",
  defaultDifficulty: "standard",
  category: "action",
  runLength: "1 to 5 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("rockfall"),
};

export const DASHLINE_MANIFEST: GameManifest = {
  ...common,
  id: "dashline",
  name: "DASHLINE",
  description: "One button. Hold longer, jump higher. The belt never stops.",
  controls: "SPACE / TAP · JUMP (HOLD = HIGHER)",
  defaultDifficulty: "standard",
  category: "action",
  runLength: "Under 3 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("dashline"),
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
  return GAME_MANIFESTS.find((manifest) => manifest.id === id);
}

/** Shared modes only. Web-only modes live outside this registry. */
export function sharedModesFor(id: string, surface: GameSurface): readonly GameMode[] {
  const manifest = getManifest(id);
  if (!manifest?.surfaces.includes(surface)) return [];
  return manifest.modes.filter((mode) => mode.surfaces.includes(surface));
}

/** Return only modes implemented on the current build surface. */
export async function availableModes(id: string): Promise<readonly GameMode[]> {
  const shared = sharedModesFor(id, PLATFORM);
  if (__PLATFORM__ === "web") {
    const { localModesFor } = await import("../twoplayer/registry");
    return [...shared, ...localModesFor(id)];
  }
  return shared;
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

/** Lazy-load a game. A mode must be implemented on this build's surface. */
export async function loadGame(id: string, modeId?: string): Promise<ArcadeGame> {
  const loader = loaders[id];
  if (!loader) throw new Error(`Unknown game: ${id}`);
  const shared = sharedModesFor(id, PLATFORM);
  if (modeId && !shared.some((mode) => mode.id === modeId)) {
    if (__PLATFORM__ === "web") {
      const { localModesFor, loadLocalGame } = await import("../twoplayer/registry");
      if (localModesFor(id).some((mode) => mode.id === modeId)) return loadLocalGame(id, modeId);
    }
    throw new Error(`Mode unavailable: ${id}/${modeId}`);
  }
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
