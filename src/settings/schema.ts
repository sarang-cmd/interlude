/** The catalogue is the only source of setting defaults, validation and UI metadata. */
export const SITES = ["claude", "chatgpt", "gemini"] as const;
export type SiteId = (typeof SITES)[number];
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
export const CATEGORIES = [
  "Display",
  "Trigger",
  "Games",
  "Controls",
  "Sound",
  "Sites",
  "Focus Guard",
  "Data",
  "Advanced",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type SettingValue = boolean | number | string | string[];
export type SettingKind =
  "boolean" | "enum" | "number" | "string" | "keybinding" | "color" | "list";
export interface SettingDefinition {
  id: string;
  type: SettingKind;
  default: SettingValue;
  label: string;
  description: string;
  category: Category;
  tags: readonly string[];
  perSite: boolean;
  requires?: { id: string; value: SettingValue };
  min?: number;
  max?: number;
  step?: number;
  options?: readonly { value: string; label: string }[];
  listOptions?: readonly string[];
  minItems?: number;
  format?: "https" | "time" | "thresholds" | "flags";
  binding?: { game: GameId; action: string };
  reload?: boolean;
}
const def = <const T extends SettingDefinition>(value: T): T => value;
const opts = (...items: readonly (readonly [string, string])[]) =>
  items.map(([value, label]) => ({ value, label }));
const placementOptions = opts(
  ["inline", "Inline"],
  ["overlay", "Overlay"],
  ["docked-composer", "Above composer"],
  ["side-panel", "Side panel"],
);
const gameOptions = opts(
  ["last", "Last played"],
  ["random", "Random"],
  ["snake", "Snake"],
  ["breakout", "Breakout"],
  ["flappy", "Flapper"],
  ["twenty48", "2048"],
  ["pong", "Pong"],
  ["blockfall", "Blockfall"],
  ["rockfall", "Rockfall Belt"],
  ["dashline", "Dashline"],
);

const BASE = [
  def({
    id: "placement",
    type: "enum",
    default: "inline",
    label: "Placement",
    description: "Where the cabinet sits in the conversation.",
    category: "Display",
    tags: ["inline", "overlay", "dock"],
    perSite: true,
    options: placementOptions,
  }),
  def({
    id: "panelWidth",
    type: "number",
    default: 640,
    min: 240,
    max: 960,
    step: 10,
    label: "Panel width",
    description: "Maximum width in pixels; never wider than the available space.",
    category: "Display",
    tags: ["size", "width"],
    perSite: true,
  }),
  def({
    id: "integerScaling",
    type: "boolean",
    default: true,
    label: "Integer pixel scaling",
    description: "Reduce the game in whole source-pixel groups.",
    category: "Display",
    tags: ["pixel", "scale"],
    perSite: true,
  }),
  def({
    id: "scanlineStrength",
    type: "number",
    default: 22,
    min: 0,
    max: 100,
    step: 1,
    label: "Scanline strength",
    description: "Scanlines inside the game canvas, from 0 to 100.",
    category: "Display",
    tags: ["crt", "texture"],
    perSite: true,
  }),
  def({
    id: "bloomStrength",
    type: "number",
    default: 5,
    min: 0,
    max: 100,
    step: 1,
    label: "Bloom strength",
    description: "Amber bloom inside the game canvas, from 0 to 100.",
    category: "Display",
    tags: ["crt", "glow"],
    perSite: true,
  }),
  def({
    id: "skipBoot",
    type: "boolean",
    default: false,
    label: "Skip power-on",
    description: "Skip the brief one-time boot sequence.",
    category: "Display",
    tags: ["boot", "flicker"],
    perSite: true,
  }),
  def({
    id: "reduceMotion",
    type: "boolean",
    default: false,
    label: "Reduced motion",
    description: "Skip boot, cabinet transitions and game shake.",
    category: "Display",
    tags: ["accessibility", "animation"],
    perSite: true,
  }),
  def({
    id: "themeMode",
    type: "enum",
    default: "match",
    label: "Host theme",
    description: "Match the host surface or force the dark cabinet.",
    category: "Display",
    tags: ["light", "dark"],
    perSite: true,
    options: opts(["match", "Match host"], ["dark", "Force dark"]),
  }),
  def({
    id: "borderStyle",
    type: "enum",
    default: "dim",
    label: "Panel border",
    description: "Choose a restrained square-edged border.",
    category: "Display",
    tags: ["outline", "cabinet"],
    perSite: true,
    options: opts(["dim", "Dim hairline"], ["bright", "Amber"], ["double", "Double line"]),
  }),
  def({
    id: "delayMs",
    type: "number",
    default: 500,
    min: 0,
    max: 5000,
    step: 100,
    label: "Reveal delay (ms)",
    description: "Wait this long after detection before showing the cabinet.",
    category: "Trigger",
    tags: ["short", "latency"],
    perSite: true,
  }),
  def({
    id: "minimumExpectedWait",
    type: "number",
    default: 0,
    min: 0,
    max: 120,
    step: 1,
    label: "Minimum expected wait (seconds)",
    description:
      "Suppress the cabinet when the recent average response time for this site is below this threshold; zero disables it.",
    category: "Trigger",
    tags: ["estimate", "history"],
    perSite: true,
  }),
  def({
    id: "ignoreShortReplies",
    type: "boolean",
    default: true,
    label: "Ignore short replies",
    description: "Cancel a pending reveal when the response ends before the delay.",
    category: "Trigger",
    tags: ["delay", "flash"],
    perSite: true,
  }),
  def({
    id: "showOnRegenerate",
    type: "boolean",
    default: true,
    label: "Show on regenerate",
    description: "Allow the cabinet during a retry or regenerate action.",
    category: "Trigger",
    tags: ["retry", "regenerate"],
    perSite: true,
  }),
  def({
    id: "firstMessageOnly",
    type: "boolean",
    default: false,
    label: "First message only",
    description: "Show for only the first detected response after opening a conversation.",
    category: "Trigger",
    tags: ["once", "conversation"],
    perSite: true,
  }),
  def({
    id: "focusedTabOnly",
    type: "boolean",
    default: false,
    label: "Only when tab is focused",
    description: "Keep the cabinet hidden when the browser tab is not focused.",
    category: "Trigger",
    tags: ["visibility", "background"],
    perSite: true,
  }),
  def({
    id: "signals",
    type: "list",
    default: ["a", "b", "c"],
    label: "Detector signals",
    description:
      "Enabled votes: a = stop control, b = indicator, c = mutation heartbeat. Two enabled votes are required when possible.",
    category: "Trigger",
    tags: ["vote", "detector"],
    perSite: true,
    listOptions: ["a", "b", "c"],
    minItems: 1,
  }),
  def({
    id: "game",
    type: "enum",
    default: "last",
    label: "Default game",
    description: "Choose a cabinet, last played, or random among enabled games.",
    category: "Games",
    tags: ["random", "last", "picker"],
    perSite: true,
    options: gameOptions,
  }),
  def({
    id: "preload",
    type: "enum",
    default: "last",
    label: "Preload",
    description: "Preload the chosen game while idle or wait until it is needed.",
    category: "Games",
    tags: ["performance", "lazy"],
    perSite: true,
    options: opts(["last", "Preload selected"], ["none", "Preload none"]),
  }),
  def({
    id: "snakeWrap",
    type: "boolean",
    default: false,
    label: "Snake / wrap walls",
    description: "Cross the edge instead of ending the run.",
    category: "Games",
    tags: ["snake", "wall"],
    perSite: true,
  }),
  def({
    id: "undo2048",
    type: "number",
    default: 3,
    min: 0,
    max: 20,
    step: 1,
    label: "2048 / undo count",
    description: "Undo allowance per run; zero disables undo.",
    category: "Games",
    tags: ["2048", "undo"],
    perSite: true,
  }),
  def({
    id: "twenty48Seconds",
    type: "number",
    default: 90,
    min: 0,
    max: 600,
    step: 1,
    label: "2048 / clock (seconds)",
    description: "Time per run; zero disables the clock.",
    category: "Games",
    tags: ["2048", "time"],
    perSite: true,
  }),
  def({
    id: "pongDifficulty",
    type: "enum",
    default: "regular",
    label: "Pong / AI level",
    description: "Reaction and aim of the opponent.",
    category: "Games",
    tags: ["pong", "difficulty"],
    perSite: true,
    options: opts(["rookie", "Rookie"], ["regular", "Regular"], ["veteran", "Veteran"]),
  }),
  def({
    id: "pongFirstTo",
    type: "number",
    default: 5,
    min: 1,
    max: 11,
    step: 1,
    label: "Pong / first to",
    description: "Points needed to win a match.",
    category: "Games",
    tags: ["pong", "score"],
    perSite: true,
  }),
  def({
    id: "blockfallGhost",
    type: "boolean",
    default: true,
    label: "Blockfall / ghost",
    description: "Show the landing projection.",
    category: "Games",
    tags: ["blockfall", "ghost"],
    perSite: true,
  }),
  def({
    id: "blockfallHold",
    type: "boolean",
    default: true,
    label: "Blockfall / hold",
    description: "Allow one held piece.",
    category: "Games",
    tags: ["blockfall", "hold"],
    perSite: true,
  }),
  def({
    id: "focusHotkey",
    type: "keybinding",
    default: "Alt+G",
    label: "Focus shortcut",
    description: "Press a modifier and a key to focus the cabinet.",
    category: "Controls",
    tags: ["keyboard", "focus"],
    perSite: true,
  }),
  def({
    id: "pointerEnabled",
    type: "boolean",
    default: true,
    label: "Pointer controls",
    description: "Allow mouse and pen control in the game.",
    category: "Controls",
    tags: ["mouse", "pointer"],
    perSite: true,
  }),
  def({
    id: "touchEnabled",
    type: "boolean",
    default: true,
    label: "Touch controls",
    description: "Allow swipes and on-screen touch controls.",
    category: "Controls",
    tags: ["touch", "swipe"],
    perSite: true,
  }),
  def({
    id: "gamepadEnabled",
    type: "boolean",
    default: true,
    label: "Gamepad",
    description: "Read a standard gamepad only while the game is focused.",
    category: "Controls",
    tags: ["controller", "pad"],
    perSite: true,
  }),
  def({
    id: "leftHanded",
    type: "boolean",
    default: false,
    label: "Left-handed layout",
    description: "Reverse the on-screen control order.",
    category: "Controls",
    tags: ["touch", "layout"],
    perSite: true,
  }),
  def({
    id: "keyRepeat",
    type: "boolean",
    default: false,
    label: "Repeat key presses",
    description: "Allow operating-system key repeats for mapped actions; pause does not repeat.",
    category: "Controls",
    tags: ["keyboard", "repeat"],
    perSite: true,
  }),
  def({
    id: "muted",
    type: "boolean",
    default: false,
    label: "Mute all sound",
    description: "Close the local audio graph and play no effects or music.",
    category: "Sound",
    tags: ["audio", "silent"],
    perSite: true,
  }),
  def({
    id: "volume",
    type: "number",
    default: 35,
    min: 0,
    max: 100,
    step: 1,
    label: "Master volume",
    description: "Synthesized audio volume from 0 to 100.",
    category: "Sound",
    tags: ["audio", "level"],
    perSite: true,
  }),
  def({
    id: "soundPack",
    type: "enum",
    default: "classic",
    label: "Sound pack",
    description: "Choose between two synthesized timbres.",
    category: "Sound",
    tags: ["effects", "audio"],
    perSite: true,
    options: opts(["classic", "Classic square"], ["soft", "Soft triangle"]),
  }),
  def({
    id: "muteHidden",
    type: "boolean",
    default: true,
    label: "Mute hidden tab",
    description: "Silence audio while the tab is hidden.",
    category: "Sound",
    tags: ["background", "audio"],
    perSite: true,
  }),
  def({
    id: "music",
    type: "boolean",
    default: false,
    label: "Music",
    description: "Play a quiet synthesized pattern during a run.",
    category: "Sound",
    tags: ["music", "audio"],
    perSite: true,
  }),
  def({
    id: "enabled",
    type: "boolean",
    default: true,
    label: "Site enabled",
    description: "Enable detection and the cabinet for this profile.",
    category: "Sites",
    tags: ["power", "claude", "chatgpt", "gemini"],
    perSite: true,
  }),
  def({
    id: "autoClose",
    type: "boolean",
    default: true,
    label: "Auto-close after finish",
    description: "Freeze first, then close after the grace period.",
    category: "Focus Guard",
    tags: ["finish", "grace"],
    perSite: true,
  }),
  def({
    id: "autoCloseGraceMs",
    type: "number",
    default: 10000,
    min: 0,
    max: 120000,
    step: 100,
    label: "Finish grace (ms)",
    description: "Time to resume or close after the response finishes. 10000 ms is 10 seconds.",
    category: "Focus Guard",
    tags: ["seconds", "close"],
    perSite: true,
    requires: { id: "autoClose", value: true },
  }),
  def({
    id: "budgetEnabled",
    type: "boolean",
    default: false,
    label: "Daily play budget",
    description: "Track a quiet daily budget; no penalty unless lockout is enabled.",
    category: "Focus Guard",
    tags: ["minutes", "limit"],
    perSite: false,
  }),
  def({
    id: "budgetMinutes",
    type: "number",
    default: 30,
    min: 1,
    max: 1440,
    step: 1,
    label: "Daily budget (minutes)",
    description: "Minutes of active play per local day across games and sites.",
    category: "Focus Guard",
    tags: ["time", "limit"],
    perSite: false,
    requires: { id: "budgetEnabled", value: true },
  }),
  def({
    id: "nudgesEnabled",
    type: "boolean",
    default: false,
    label: "Play-time nudges",
    description: "Show a gentle notice at chosen daily play-time thresholds.",
    category: "Focus Guard",
    tags: ["reminder", "time"],
    perSite: false,
  }),
  def({
    id: "nudgeMinutes",
    type: "list",
    default: ["10", "20", "30"],
    label: "Nudge thresholds (minutes)",
    description: "Comma-separated positive minute values, for example 10, 20, 30.",
    category: "Focus Guard",
    tags: ["reminder", "threshold"],
    perSite: false,
    format: "thresholds",
    requires: { id: "nudgesEnabled", value: true },
  }),
  def({
    id: "budgetLockout",
    type: "boolean",
    default: false,
    label: "Lock at budget",
    description: "Close play at the daily budget until tomorrow or until lockout is disabled.",
    category: "Focus Guard",
    tags: ["limit", "lock"],
    perSite: false,
    requires: { id: "budgetEnabled", value: true },
  }),
  def({
    id: "quietHours",
    type: "boolean",
    default: false,
    label: "Quiet hours",
    description: "Do not show a cabinet during the selected local days and times.",
    category: "Focus Guard",
    tags: ["schedule", "quiet"],
    perSite: false,
  }),
  def({
    id: "quietDays",
    type: "list",
    default: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    label: "Quiet days",
    description: "Days when quiet hours begin.",
    category: "Focus Guard",
    tags: ["schedule", "weekday"],
    perSite: false,
    listOptions: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    requires: { id: "quietHours", value: true },
  }),
  def({
    id: "quietStart",
    type: "string",
    default: "22:00",
    label: "Quiet starts",
    description: "Local time, 24-hour format.",
    category: "Focus Guard",
    tags: ["schedule", "time"],
    perSite: false,
    format: "time",
    requires: { id: "quietHours", value: true },
  }),
  def({
    id: "quietEnd",
    type: "string",
    default: "07:00",
    label: "Quiet ends",
    description: "Local time, 24-hour format; can cross midnight.",
    category: "Focus Guard",
    tags: ["schedule", "time"],
    perSite: false,
    format: "time",
    requires: { id: "quietHours", value: true },
  }),
  def({
    id: "studyMode",
    type: "boolean",
    default: false,
    label: "Study Mode",
    description: "Disable games during the selected study hours.",
    category: "Focus Guard",
    tags: ["study", "schedule"],
    perSite: false,
  }),
  def({
    id: "studyDays",
    type: "list",
    default: ["mon", "tue", "wed", "thu", "fri"],
    label: "Study days",
    description: "Days when the study period begins.",
    category: "Focus Guard",
    tags: ["study", "weekday"],
    perSite: false,
    listOptions: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    requires: { id: "studyMode", value: true },
  }),
  def({
    id: "studyStart",
    type: "string",
    default: "09:00",
    label: "Study starts",
    description: "Local time, 24-hour format.",
    category: "Focus Guard",
    tags: ["study", "time"],
    perSite: false,
    format: "time",
    requires: { id: "studyMode", value: true },
  }),
  def({
    id: "studyEnd",
    type: "string",
    default: "17:00",
    label: "Study ends",
    description: "Local time, 24-hour format; can cross midnight.",
    category: "Focus Guard",
    tags: ["study", "time"],
    perSite: false,
    format: "time",
    requires: { id: "studyMode", value: true },
  }),
  def({
    id: "sessionSummary",
    type: "boolean",
    default: false,
    label: "Session summary",
    description: "Show a short local play-time summary when a cabinet closes.",
    category: "Focus Guard",
    tags: ["toast", "summary"],
    perSite: false,
  }),
  def({
    id: "streamHookEnabled",
    type: "boolean",
    default: false,
    label: "Stream timing hook",
    description:
      "Optionally observe event-stream open and close timing. It does not read chunks, request bodies, URLs or message text, and it never votes.",
    category: "Advanced",
    tags: ["privacy", "stream", "diagnostics"],
    perSite: true,
  }),
  def({
    id: "remoteSelectors",
    type: "boolean",
    default: false,
    label: "Remote selector updates",
    description:
      "Fetch a signed selector file at most once every 12 hours; no cookies or identifiers.",
    category: "Advanced",
    tags: ["remote", "signature", "privacy"],
    perSite: false,
  }),
  def({
    id: "selectorUrl",
    type: "string",
    default: "https://interlude.vercel.app/selectors/v1.json",
    label: "Selector URL",
    description: "HTTPS JSON endpoint for signed selector data; the endpoint must allow CORS.",
    category: "Advanced",
    tags: ["remote", "url"],
    perSite: false,
    format: "https",
    requires: { id: "remoteSelectors", value: true },
  }),
  def({
    id: "updateChecks",
    type: "boolean",
    default: true,
    label: "Check for updates",
    description:
      "Check the static release manifest on startup and at most daily. No automatic downloads or identifiers.",
    category: "Advanced",
    tags: ["version", "network"],
    perSite: false,
  }),
  def({
    id: "debugLogging",
    type: "boolean",
    default: false,
    label: "Debug logging",
    description: "Log state transitions and structural diagnostics only; never message content.",
    category: "Advanced",
    tags: ["debug", "console"],
    perSite: false,
  }),
  def({
    id: "experimentalFlags",
    type: "list",
    default: [],
    label: "Experimental flags",
    description: "Comma-separated experimental feature names. Unknown names have no effect.",
    category: "Advanced",
    tags: ["flags", "experiments"],
    perSite: false,
    format: "flags",
  }),
] as const;

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
const names: Record<GameId, string> = {
  snake: "Snake",
  breakout: "Breakout",
  flappy: "Flapper",
  twenty48: "2048",
  pong: "Pong",
  blockfall: "Blockfall",
  rockfall: "Rockfall Belt",
  dashline: "Dashline",
};
const generated: SettingDefinition[] = GAME_IDS.flatMap((game) => [
  {
    id: `game.${game}.enabled`,
    type: "boolean",
    default: true,
    label: `${names[game]} / enabled`,
    description: "Include this game in the picker and random rotation.",
    category: "Games",
    tags: [game, "enable"],
    perSite: true,
  },
  {
    id: `game.${game}.difficulty`,
    type: "enum",
    default: "standard",
    label: `${names[game]} / difficulty`,
    description: "Adjust the pace of this cabinet; game-specific options still apply.",
    category: "Games",
    tags: [game, "difficulty"],
    perSite: true,
    options: opts(["relaxed", "Relaxed"], ["standard", "Standard"], ["fast", "Fast"]),
  },
  {
    id: `game.${game}.speed`,
    type: "number",
    default: 100,
    min: 50,
    max: 150,
    step: 5,
    label: `${names[game]} / speed (%)`,
    description: "Scale simulation speed during play.",
    category: "Games",
    tags: [game, "speed"],
    perSite: true,
  },
  {
    id: `game.${game}.muted`,
    type: "boolean",
    default: false,
    label: `${names[game]} / mute`,
    description: "Mute this game without changing the master volume.",
    category: "Sound",
    tags: [game, "mute"],
    perSite: true,
  },
  ...GAME_ACTIONS[game].map((action): SettingDefinition => ({
    id: `key.${game}.${action}`,
    type: "keybinding",
    default: ACTION_DEFAULTS[action]!,
    label: `${names[game]} / ${action}`,
    description:
      "Press a physical key to assign this action. Duplicate bindings for one game are rejected.",
    category: "Controls",
    tags: [game, action, "remap", "keyboard"],
    perSite: true,
    binding: { game, action },
  })),
]);
export const SETTINGS_SCHEMA: readonly SettingDefinition[] = [...BASE, ...generated];
export const SCHEMA_VERSION = 2;
export const SETTINGS_BY_ID = new Map(SETTINGS_SCHEMA.map((setting) => [setting.id, setting]));

type EnumValue<T> = T extends { options: readonly { value: infer V }[] } ? V : string;
type ValueFor<T> = T extends { type: "boolean" }
  ? boolean
  : T extends { type: "number" }
    ? number
    : T extends { type: "list" }
      ? string[]
      : T extends { type: "enum" }
        ? EnumValue<T>
        : string;
type BaseValues = { [D in (typeof BASE)[number] as D["id"]]: ValueFor<D> };
export type Placement = "inline" | "overlay" | "docked-composer" | "side-panel";
export type InterludeSettings = Omit<BaseValues, "placement" | "pongDifficulty"> & {
  placement: Placement;
  pongDifficulty: "rookie" | "regular" | "veteran";
} & Record<string, SettingValue>;

export function defaults(): InterludeSettings {
  return Object.fromEntries(
    SETTINGS_SCHEMA.map((s) => [s.id, Array.isArray(s.default) ? [...s.default] : s.default]),
  ) as InterludeSettings;
}

/** Invalid inputs are rejected, not coerced; callers can silently restore defaults. */
export function validValue(definition: SettingDefinition, value: unknown): value is SettingValue {
  if (definition.type === "boolean") return typeof value === "boolean";
  if (definition.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (definition.min ?? -Infinity) ||
      value > (definition.max ?? Infinity)
    )
      return false;
    const units = (value - (definition.min ?? 0)) / (definition.step ?? 1);
    return Math.abs(units - Math.round(units)) < 1e-8;
  }
  if (definition.type === "enum")
    return (
      typeof value === "string" && !!definition.options?.some((option) => option.value === value)
    );
  if (definition.type === "list") {
    if (
      !Array.isArray(value) ||
      value.length < (definition.minItems ?? 0) ||
      value.length > 100 ||
      !value.every((entry) => typeof entry === "string" && entry.length <= 80)
    )
      return false;
    if (new Set(value).size !== value.length) return false;
    if (definition.listOptions && !value.every((entry) => definition.listOptions!.includes(entry)))
      return false;
    if (
      definition.format === "thresholds" &&
      !value.every(
        (entry) => /^\d{1,4}$/.test(entry) && Number(entry) >= 1 && Number(entry) <= 1440,
      )
    )
      return false;
    return (
      definition.format !== "flags" || value.every((entry) => /^[a-z][a-z0-9-]{0,39}$/.test(entry))
    );
  }
  if (typeof value !== "string" || value.length > 2048) return false;
  if (definition.type === "color") return /^#[0-9a-f]{6}$/i.test(value);
  if (definition.type === "keybinding")
    return definition.binding
      ? /^(Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Space|Enter|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Numpad[0-9])$/.test(
          value,
        )
      : /^(?:(?:Ctrl|Alt|Shift|Meta)\+)+[A-Z0-9]$/.test(value);
  if (definition.format === "time") return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (definition.format === "https") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.hash;
    } catch {
      return false;
    }
  }
  return true;
}
