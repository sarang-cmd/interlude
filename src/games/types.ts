/**
 * Shared game contract. Every game implements ArcadeGame and ships a manifest
 * entry in src/games/manifest.ts.
 */
import type { RNG } from "../shared/rng";
import type { Input } from "../engine/input";
import type { Sound } from "../engine/sound";
import type { ParticleSystem } from "../engine/particles";
import type { InterludeSettings } from "../shared/storage";

export type GameSupport = "keyboard" | "pointer" | "touch" | "gamepad";

export interface GameManifest {
  id: string;
  name: string;
  description: string;
  /** One line, e.g. "ARROWS STEER · SPACE = BITE". */
  controls: string;
  defaultDifficulty: string;
  supports: GameSupport[];
}

/** Everything a game may touch. Engine implements it. */
export interface GameContext {
  readonly width: number;
  readonly height: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly rng: RNG;
  readonly input: Input;
  readonly sound: Sound;
  readonly particles: ParticleSystem;
  /** Shake the whole canvas. mag in logical px, dur in seconds. */
  shake(mag: number, dur: number): void;
  /** Freeze updates for impact frames. */
  hitStop(ms: number): void;
  /** Floating "+100" style score popup at a logical position. */
  scorePop(x: number, y: number, text: string): void;
  readonly settings: InterludeSettings;
  /** Personal best for this game (already loaded). */
  readonly highScore: number;
  /** End the run; engine persists the high score and shows GAME OVER. */
  reportGameOver(): Promise<void>;
}

export interface ArcadeGame {
  readonly manifest: GameManifest;
  /** Current score; engine renders it in the HUD. */
  readonly score: number;
  init(ctx: GameContext): void;
  fixedUpdate(dt: number): void;
  /** alpha in [0,1) — interpolation factor between fixed steps. */
  render(alpha: number): void;
  destroy(): void;
  /** Arcade-manual hint line for the READY screen. */
  readyHint: string;
  /** Called instead of fixedUpdate when the game is in 'ready' attract mode. */
  updateAttract?(dt: number): void;
  renderAttract?(): void;
}
