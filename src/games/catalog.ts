/** Game IDs and player-one defaults shared by the registry and settings. */
export const GAME_IDS = [
  "snake",
  "breakout",
  "flappy",
  "twenty48",
  "pong",
  "blockfall",
  "rockfall",
  "dashline",
  "tictactoe",
  "dropfour",
  "flipdisc",
  "drafts",
  "dotsboxes",
  "fleet",
  "handsignals",
  "sweep",
  "pairs",
  "darkroom",
  "slide",
  "echo",
  "codebreak",
  "quickdraw",
  "pop",
] as const;
export type GameId = (typeof GAME_IDS)[number];
export const SPEED_CHOICES = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;

export const GAME_ACTIONS: Record<GameId, readonly string[]> = {
  snake: ["left", "right", "up", "down", "pause"],
  breakout: ["left", "right", "primary", "pause"],
  flappy: ["primary", "pause"],
  twenty48: ["left", "right", "up", "down", "secondary", "pause"],
  pong: ["up", "down", "pause"],
  blockfall: ["left", "right", "up", "down", "primary", "secondary", "pause"],
  rockfall: ["left", "right", "up", "primary", "pause"],
  dashline: ["primary", "pause"],
  tictactoe: ["left", "right", "up", "down", "primary", "pause"],
  dropfour: ["left", "right", "primary", "pause"],
  flipdisc: ["left", "right", "up", "down", "primary", "pause"],
  drafts: ["left", "right", "up", "down", "primary", "pause"],
  dotsboxes: ["left", "right", "up", "down", "primary", "pause"],
  fleet: ["left", "right", "up", "down", "primary", "pause"],
  handsignals: ["left", "right", "primary", "pause"],
  sweep: ["left", "right", "up", "down", "primary", "secondary", "pause"],
  pairs: ["left", "right", "up", "down", "primary", "pause"],
  darkroom: ["left", "right", "up", "down", "pause"],
  slide: ["left", "right", "up", "down", "pause"],
  echo: ["left", "right", "up", "down", "pause"],
  codebreak: ["left", "right", "up", "down", "primary", "pause"],
  quickdraw: ["primary", "pause"],
  pop: ["left", "right", "up", "down", "primary", "pause"],
};
export const ACTION_DEFAULTS: Record<string, string> = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  primary: "Space",
  secondary: "KeyC",
  pause: "KeyP",
};

export function playerOneBindings(game: GameId): Readonly<Record<string, string>> {
  return Object.fromEntries(
    GAME_ACTIONS[game].map((action) => [
      action,
      game === "twenty48" && action === "secondary" ? "KeyU" : ACTION_DEFAULTS[action]!,
    ]),
  );
}
