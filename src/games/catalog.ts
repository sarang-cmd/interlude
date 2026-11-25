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
] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_ACTIONS: Record<GameId, readonly string[]> = {
  snake: ["left", "right", "up", "down", "pause"],
  breakout: ["left", "right", "primary", "pause"],
  flappy: ["primary", "pause"],
  twenty48: ["left", "right", "up", "down", "secondary", "pause"],
  pong: ["up", "down", "pause"],
  blockfall: ["left", "right", "up", "down", "primary", "secondary", "pause"],
  rockfall: ["left", "right", "up", "primary", "pause"],
  dashline: ["primary", "pause"],
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
