/**
 * GameLoop — fixed timestep (60 Hz) update with interpolated render.
 *
 * Rate control:
 *  - full rate: update+render every rAF (capped at 60 Hz logic)
 *  - low rate: renders every 2nd rAF (~30 Hz), logic still fixed-step
 *  - stopped: no rAF at all. Idle means zero timers, zero frames.
 *  - `hitStop(ms)`: freezes updates (render continues) for impact frames
 */
export class GameLoop {
  static readonly STEP = 1 / 60;

  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private frameCounter = 0;
  private lowRate = false;
  private hitStopUntil = 0;
  private running = false;

  /** Fixed-step update. dt is always 1/60. */
  onFixedUpdate: (dt: number) => void = () => {};
  /** Render with interpolation alpha in [0,1). */
  onRender: (alpha: number) => void = () => {};
  /** Called once per rendered frame with measured fps. */
  onFrameStats: (fps: number) => void = () => {};

  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;

  get isRunning(): boolean {
    return this.running;
  }

  setLowRate(low: boolean): void {
    this.lowRate = low;
  }

  hitStop(ms: number): void {
    this.hitStopUntil = performance.now() + ms;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.accumulator = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Clamp huge deltas (tab was suspended) so we don't spiral.
    if (frameTime > 0.25) frameTime = 0.25;

    const frozen = now < this.hitStopUntil;
    if (!frozen) {
      this.accumulator += frameTime;
      let steps = 0;
      while (this.accumulator >= GameLoop.STEP && steps < 5) {
        this.onFixedUpdate(GameLoop.STEP);
        this.accumulator -= GameLoop.STEP;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
    }

    if (this.lowRate) {
      this.frameCounter++;
      if (this.frameCounter % 2 !== 0) return;
    }

    const alpha = frozen ? 1 : this.accumulator / GameLoop.STEP;
    this.onRender(alpha);

    this.fpsTimer += frameTime;
    this.fpsFrames++;
    if (this.fpsTimer >= 0.5) {
      this.onFrameStats(this.fpsFrames / this.fpsTimer);
      this.fpsTimer = 0;
      this.fpsFrames = 0;
    }
  };
}
