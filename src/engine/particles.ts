/**
 * Particle system — integer-pixel debris, phosphor-colored.
 * Particles are plain quads; no textures, no allocation in the hot loop
 * beyond spawn/burst intent (arrays are reused by filtering).
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export class ParticleSystem {
  readonly particles: Particle[] = [];

  spawn(partial: Omit<Particle, "life" | "maxLife"> & { life?: number }): void {
    const life = partial.life ?? 0.6;
    this.particles.push({ ...partial, life, maxLife: life });
  }

  /** Radial burst — the standard hit/explosion puff. */
  burst(
    x: number,
    y: number,
    count: number,
    options: {
      color?: string | string[];
      speed?: number;
      size?: number;
      gravity?: number;
      life?: number;
    } = {},
  ): void {
    const colors = Array.isArray(options.color) ? options.color : [options.color ?? "#FFB000"];
    const speed = options.speed ?? 90;
    const size = options.size ?? 2;
    const gravity = options.gravity ?? 160;
    const life = options.life ?? 0.7;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.75);
      this.spawn({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - speed * 0.25,
        gravity,
        size: Math.max(1, Math.round(size * (0.6 + Math.random() * 0.9))),
        color: colors[Math.floor(Math.random() * colors.length)] as string,
        life: life * (0.6 + Math.random() * 0.8),
      });
    }
  }

  /** Sparks that drift down slowly — score pops, line clears. */
  drizzle(x: number, y: number, count: number, color = "#FFD36B"): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 40,
        gravity: 60,
        size: 1,
        color,
        life: 0.9,
      });
    }
  }

  update(dt: number): void {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Render as snapped integer rects — chunky, phosphor. */
  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * (0.5 + t * 0.5)));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
  }
}
