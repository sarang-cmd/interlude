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
const WATCH: GameMode = {
  id: "watch",
  label: "WATCH CPU",
  description: "Watch two CPU opponents play. Watch matches do not save records.",
  players: 0,
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
  name: "FLAPPY-STYLE FLYER",
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
  modes: [CPU, WATCH],
  ai: { opponent: true, watchable: true },
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
  name: "ENDLESS RUNNER",
  description: "One button. Hold longer, jump higher. The belt never stops.",
  controls: "SPACE / TAP · JUMP (HOLD = HIGHER)",
  defaultDifficulty: "standard",
  category: "action",
  runLength: "Under 3 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("dashline"),
};

export const TICTACTOE_MANIFEST: GameManifest = {
  ...common,
  id: "tictactoe",
  name: "NOUGHTS AND CROSSES",
  description: "Three in a row on 3×3, or four in a row on 4×4 and 5×5.",
  controls: "ARROWS SELECT · SPACE MARK · TAP A SQUARE",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "Under 2 minutes",
  modes: [CPU, WATCH],
  ai: { opponent: true, watchable: true },
  playerOneBindings: playerOneBindings("tictactoe"),
};

export const DROP_FOUR_MANIFEST: GameManifest = {
  ...common,
  id: "dropfour",
  name: "DROP FOUR",
  description: "Drop discs into a seven-column, six-row board. Connect four to win.",
  controls: "LEFT/RIGHT SELECT · SPACE DROP · TAP A COLUMN",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "2 to 5 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("dropfour"),
};
export const FLIP_DISC_MANIFEST: GameManifest = {
  ...common,
  id: "flipdisc",
  name: "FLIP DISC",
  description: "Surround and flip discs on an 8×8 board. Finish with the most discs.",
  controls: "ARROWS SELECT · SPACE PLACE · TAP A SQUARE",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "3 to 8 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("flipdisc"),
};

export const DRAFTS_MANIFEST: GameManifest = {
  ...common,
  id: "drafts",
  name: "DRAFTS",
  description: "Move diagonally, capture opposing pieces and crown kings.",
  controls: "ARROWS SELECT · SPACE PICK PIECE / DESTINATION · TAP",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "5 to 12 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("drafts"),
};

export const DOTS_BOXES_MANIFEST: GameManifest = {
  ...common,
  id: "dotsboxes",
  name: "DOTS AND BOXES",
  description: "Draw edges, complete boxes and earn another turn. Most boxes wins.",
  controls: "ARROWS SELECT EDGE · SPACE DRAW · TAP AN EDGE",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "3 to 8 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("dotsboxes"),
};

export const FLEET_MANIFEST: GameManifest = {
  ...common,
  id: "fleet",
  name: "FLEET",
  description: "Find and sink the hidden fleet before yours is sunk.",
  controls: "ARROWS AIM · SPACE FIRE · TAP TARGET GRID",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "5 to 12 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("fleet"),
};

export const HAND_SIGNALS_MANIFEST: GameManifest = {
  ...common,
  id: "handsignals",
  name: "HAND SIGNALS",
  description: "Choose a signal against the CPU. Optional Lizard Spock rules.",
  controls: "LEFT/RIGHT SELECT · SPACE CHOOSE · TAP A SIGNAL",
  defaultDifficulty: "regular",
  category: "board",
  runLength: "1 to 3 minutes",
  modes: [CPU],
  ai: { opponent: true, watchable: false },
  playerOneBindings: playerOneBindings("handsignals"),
};

export const SWEEP_MANIFEST: GameManifest = {
  ...common,
  id: "sweep",
  name: "SWEEP",
  description: "Clear a minefield; mark hazards and open safe squares.",
  controls: "ARROWS MOVE · SPACE OPEN · C FLAG · TAP TO OPEN",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "3 to 8 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("sweep"),
};
export const SLIDE_MANIFEST: GameManifest = {
  ...common,
  id: "slide",
  name: "SLIDE",
  description: "Slide numbered tiles into order on a solvable puzzle board.",
  controls: "ARROWS MOVE GAP · TAP NEIGHBOR · SWIPE",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "3 to 10 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("slide"),
};
export const POP_MANIFEST: GameManifest = {
  ...common,
  id: "pop",
  name: "POP",
  description: "Pop the moving targets before the clock runs out.",
  controls: "ARROWS AIM · SPACE POP · TAP TARGET",
  defaultDifficulty: "standard",
  category: "arcade",
  runLength: "45 seconds",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("pop"),
};

export const PAIRS_MANIFEST: GameManifest = {
  ...common,
  id: "pairs",
  name: "PAIRS",
  description: "Turn over cards and match all eight pairs.",
  controls: "ARROWS SELECT · SPACE OR TAP FLIPS",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "2 to 5 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("pairs"),
};
export const ECHO_MANIFEST: GameManifest = {
  ...common,
  id: "echo",
  name: "ECHO",
  description: "Watch a growing sequence, then repeat it.",
  controls: "ARROWS OR TAP · REPEAT THE SEQUENCE",
  defaultDifficulty: "standard",
  category: "casual",
  runLength: "1 to 5 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("echo"),
};

export const DARK_ROOM_MANIFEST: GameManifest = {
  ...common,
  id: "darkroom",
  name: "DARK ROOM",
  description: "Explore a dark maze, find a key and escape.",
  controls: "ARROWS EXPLORE · SWIPE OR TAP NEIGHBOR",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "3 to 8 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("darkroom"),
};

export const CODEBREAK_MANIFEST: GameManifest = {
  ...common,
  id: "codebreak",
  name: "CODEBREAK",
  description: "Crack a four-digit code using exact and misplaced clues.",
  controls: "ARROWS CHANGE DIGITS · SPACE SUBMIT · TAP CYCLES",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "3 to 8 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("codebreak"),
};

export const QUICK_DRAW_MANIFEST: GameManifest = {
  ...common,
  id: "quickdraw",
  name: "QUICK DRAW",
  description: "Wait for the signal, then react as quickly as you can.",
  controls: "WAIT FOR GO · SPACE OR TAP TO DRAW",
  defaultDifficulty: "standard",
  category: "casual",
  runLength: "Under a minute",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("quickdraw"),
};

export const LETTERS_MANIFEST: GameManifest = {
  ...common,
  id: "letters",
  name: "LETTERS",
  description: "Guess a word from general, study or your own word lists.",
  controls: "ARROWS SELECT · SPACE OR TAP GUESSES",
  defaultDifficulty: "standard",
  category: "puzzle",
  runLength: "1 to 4 minutes",
  modes: [SOLO],
  ai: { opponent: false, watchable: false },
  playerOneBindings: playerOneBindings("letters"),
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
  TICTACTOE_MANIFEST,
  DROP_FOUR_MANIFEST,
  FLIP_DISC_MANIFEST,
  DRAFTS_MANIFEST,
  DOTS_BOXES_MANIFEST,
  FLEET_MANIFEST,
  HAND_SIGNALS_MANIFEST,
  SWEEP_MANIFEST,
  PAIRS_MANIFEST,
  DARK_ROOM_MANIFEST,
  SLIDE_MANIFEST,
  ECHO_MANIFEST,
  CODEBREAK_MANIFEST,
  QUICK_DRAW_MANIFEST,
  LETTERS_MANIFEST,
  POP_MANIFEST,
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

const loaders: Record<string, (modeId?: string) => Promise<ArcadeGame>> = {
  snake: async () => new (await import("./snake/game")).SnakeGame(),
  breakout: async () => new (await import("./breakout/game")).BreakoutGame(),
  flappy: async () => new (await import("./flappy/game")).FlappyGame(),
  twenty48: async () => new (await import("./2048/game")).Game2048Game(),
  pong: async (mode) =>
    new (await import("./pong/game")).PongGame(mode ? mode === "watch" : undefined),
  blockfall: async () => new (await import("./blockfall/game")).BlockfallGame(),
  rockfall: async () => new (await import("./rockfall/game")).RockfallGame(),
  dashline: async () => new (await import("./dashline/game")).DashlineGame(),
  tictactoe: async (mode) =>
    new (await import("./tictactoe/game")).TicTacToeGame(mode ? mode === "watch" : undefined),
  dropfour: async () => new (await import("./dropfour/game")).DropFourGame(),
  flipdisc: async () => new (await import("./flipdisc/game")).FlipDiscGame(),
  drafts: async () => new (await import("./drafts/game")).DraftsGame(),
  dotsboxes: async () => new (await import("./dotsboxes/game")).DotsBoxesGame(),
  fleet: async () => new (await import("./fleet/game")).FleetGame(),
  handsignals: async () => new (await import("./handsignals/game")).HandSignalsGame(),
  sweep: async () => new (await import("./sweep/game")).SweepGame(),
  pairs: async () => new (await import("./pairs/game")).PairsGame(),
  darkroom: async () => new (await import("./darkroom/game")).DarkRoomGame(),
  slide: async () => new (await import("./slide/game")).SlideGame(),
  echo: async () => new (await import("./echo/game")).EchoGame(),
  codebreak: async () => new (await import("./codebreak/game")).CodebreakGame(),
  quickdraw: async () => new (await import("./quickdraw/game")).QuickDrawGame(),
  letters: async () => new (await import("./letters/game")).LettersGame(),
  pop: async () => new (await import("./pop/game")).PopGame(),
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
  return loader(modeId);
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
