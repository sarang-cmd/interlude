/**
 * Sound — every effect is synthesized with WebAudio. No audio files.
 *
 * The AudioContext is created lazily on the first user gesture to satisfy
 * autoplay policies; before that, calls are silently dropped.
 */

export type SfxName =
  | "coin"
  | "blip"
  | "jump"
  | "flap"
  | "hit"
  | "paddle"
  | "breakBrick"
  | "explosion"
  | "lineClear"
  | "levelUp"
  | "gameOver"
  | "ready"
  | "undo"
  | "hold"
  | "powerup";

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
  }

  /** Release the audio graph when the panel closes. */
  silence(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    options: { slideTo?: number; volume?: number; delay?: number } = {},
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (options.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (options.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.slideTo),
        t0 + duration,
      );
    }
    const vol = options.volume ?? 0.5;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, volume = 0.4, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t0);
  }

  play(name: SfxName): void {
    if (!this.ctx) return; // not unlocked yet — stay silent, never throw
    switch (name) {
      case "coin":
        this.tone(988, 0.07, "square", { volume: 0.35 });
        this.tone(1319, 0.22, "square", { volume: 0.35, delay: 0.07 });
        break;
      case "blip":
        this.tone(660, 0.05, "square", { volume: 0.25 });
        break;
      case "jump":
        this.tone(220, 0.12, "square", { slideTo: 440, volume: 0.3 });
        break;
      case "flap":
        this.tone(520, 0.06, "triangle", { slideTo: 760, volume: 0.4 });
        break;
      case "hit":
        this.noise(0.08, 0.3);
        this.tone(180, 0.08, "sawtooth", { volume: 0.3 });
        break;
      case "paddle":
        this.tone(330, 0.06, "square", { volume: 0.35 });
        break;
      case "breakBrick":
        this.noise(0.06, 0.25);
        this.tone(520 + Math.random() * 120, 0.09, "square", { volume: 0.3 });
        break;
      case "explosion":
        this.noise(0.5, 0.5);
        this.tone(110, 0.45, "sawtooth", { slideTo: 40, volume: 0.4 });
        break;
      case "lineClear":
        [523, 659, 784].forEach((f, i) =>
          this.tone(f, 0.1, "square", { volume: 0.3, delay: i * 0.07 }),
        );
        break;
      case "levelUp":
        [392, 523, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, 0.12, "square", { volume: 0.3, delay: i * 0.08 }),
        );
        break;
      case "gameOver":
        [392, 330, 262, 196].forEach((f, i) =>
          this.tone(f, 0.22, "triangle", { volume: 0.4, delay: i * 0.16 }),
        );
        break;
      case "ready":
        this.tone(784, 0.08, "square", { volume: 0.3 });
        this.tone(1047, 0.16, "square", { volume: 0.3, delay: 0.09 });
        break;
      case "undo":
        this.tone(440, 0.06, "triangle", { slideTo: 330, volume: 0.3 });
        break;
      case "hold":
        this.tone(587, 0.07, "triangle", { volume: 0.3 });
        break;
      case "powerup":
        [659, 880, 1319].forEach((f, i) =>
          this.tone(f, 0.1, "square", { volume: 0.28, delay: i * 0.06 }),
        );
        break;
    }
  }
}
