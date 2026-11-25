/**
 * ROCKFALL BELT — canvas renderer.
 */
import type { ArcadeGame, GameContext } from "../types";
import { ROCKFALL_MANIFEST } from "../manifest";
import { ROCK_LARGE, RockfallLogic } from "./logic";
import { TOKENS } from "../../../design/tokens";
import { drawText } from "../shared";

export class RockfallGame implements ArcadeGame {
  readonly manifest = ROCKFALL_MANIFEST;
  readonly readyHint = "ARROWS TURN + THRUST · SPACE FIRES";
  score = 0;

  private g!: GameContext;
  private logic!: RockfallLogic;
  private elapsed = 0;

  init(ctx: GameContext): void {
    this.g = ctx;
    this.score = 0;
    this.elapsed = 0;
    this.logic = new RockfallLogic({ seed: Math.floor(ctx.rng.next() * 0xffffffff) });
    // A held fire action repeats at the logic's fixed cooldown.
  }

  destroy(): void {
    /* nothing retained */
  }

  fixedUpdate(dt: number): void {
    this.elapsed += dt;
    const input = this.g.input;
    if (input.isDown("left")) this.logic.rotate(-1, dt);
    if (input.isDown("right")) this.logic.rotate(1, dt);
    this.logic.setThrust(input.isDown("up"));
    const bufferedFire = input.wasPressedWithin("primary", 140);
    if (bufferedFire || input.isDown("primary")) {
      if (this.logic.fire()) {
        input.consumePresses("primary");
        this.g.sound.play("blip");
        this.g.particles.burst(this.logic.ship.x, this.logic.ship.y, 3, {
          color: ["#FFD36B"],
          speed: 60,
          size: 1,
          gravity: 0,
          life: 0.2,
        });
      }
    }
    // Touch: hold right/left of ship to turn; hold near the ship to thrust.
    input.drainTaps();
    const pointer = input.pointerPosition();
    if (pointer.isDown) {
      const dx = pointer.x - this.logic.ship.x;
      if (Math.abs(dx) > 30) this.logic.rotate(dx > 0 ? 1 : -1, dt);
      else this.logic.setThrust(true);
    }

    const events = this.logic.update(dt);
    for (const event of events) {
      switch (event.kind) {
        case "rockSplit":
          this.g.sound.play("hit");
          this.g.shake(3, 0.15);
          this.g.particles.burst(event.x, event.y, 12, {
            color: ["#FFB000", "#7A5600", "#FFD36B"],
            speed: 90,
            size: 2,
          });
          break;
        case "rockDestroyed":
          this.g.sound.play("coin");
          this.g.scorePop(event.x, event.y, "+100");
          this.g.particles.burst(event.x, event.y, 8, {
            color: ["#FFD36B"],
            speed: 60,
            size: 1,
          });
          this.g.hitStop(25);
          break;
        case "shipHit":
          this.g.sound.play("explosion");
          this.g.shake(7, 0.4);
          this.g.hitStop(150);
          this.g.particles.burst(event.x, event.y, 30, {
            color: ["#D6452B", "#FFB000", "#FFD36B"],
            speed: 150,
            size: 3,
          });
          break;
        case "shieldTake":
          this.g.sound.play("powerup");
          this.g.scorePop(this.logic.ship.x, this.logic.ship.y - 18, "SHIELD");
          break;
        case "waveClear":
          this.g.sound.play("levelUp");
          this.g.scorePop(this.g.width / 2, 130, `WAVE ${event.wave} CLEAR`);
          break;
        case "gameOver":
          this.score = this.logic.score;
          void this.g.reportGameOver();
          break;
      }
    }
    this.score = this.logic.score;
  }

  render(_alpha: number): void {
    const ctx = this.g.ctx;
    const w = this.g.width;
    const h = this.g.height;

    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, 0, w, h);
    // Star field — deterministic dim dots
    ctx.fillStyle = "rgba(233,223,200,0.28)";
    for (let i = 0; i < 42; i++) {
      const sx = (i * 379 + 173) % w;
      const sy = (i * 211 + 97) % h;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }

    // Asteroids — chunky irregular polygons
    for (const rock of this.logic.asteroids) {
      ctx.beginPath();
      const n = rock.verts.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = rock.radius * (rock.verts[i] ?? 1);
        const px = rock.x + Math.cos(a) * r;
        const py = rock.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#1E1710";
      ctx.fill();
      ctx.strokeStyle = rock.size === ROCK_LARGE ? TOKENS.phosphor : TOKENS.phosphorDim;
      ctx.lineWidth = rock.size === ROCK_LARGE ? 2 : 1;
      ctx.stroke();
    }

    // Shield pickups — green chevrons
    for (const s of this.logic.shields) {
      ctx.strokeStyle = TOKENS.signalGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - 7, s.y + 4);
      ctx.lineTo(s.x, s.y - 6);
      ctx.lineTo(s.x + 7, s.y + 4);
      ctx.stroke();
    }

    // Bullets
    ctx.fillStyle = TOKENS.phosphorHot;
    for (const b of this.logic.bullets) {
      ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
    }

    // Ship — phosphor dart; blink while hit-flash invulnerable
    const ship = this.logic.ship;
    const shielded = this.logic.shielded;
    const blink = shielded && Math.floor(this.elapsed * (1000 / 110)) % 2 === 0;
    if (!blink) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-10, 10);
      ctx.lineTo(0, 6);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.fillStyle = shielded ? "#241B0E" : TOKENS.ink;
      ctx.fill();
      ctx.strokeStyle = shielded ? TOKENS.signalGreen : TOKENS.phosphor;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (ship.thrusting && Math.floor(this.elapsed * (1000 / 70)) % 2 === 0) {
        ctx.strokeStyle = TOKENS.phosphorHot;
        ctx.beginPath();
        ctx.moveTo(-4, 10);
        ctx.lineTo(0, 18);
        ctx.lineTo(4, 10);
        ctx.stroke();
      }
      ctx.restore();
      if (shielded) {
        ctx.strokeStyle = "rgba(95,191,106,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 17, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Readout
    drawText(ctx, `WAVE ${this.logic.wave}`, 10, 44, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphorDim,
    });
    drawText(ctx, `HULL ${"▮".repeat(this.logic.lives)}`, w - 10, 44, {
      font: '11px "IBM Plex Mono", monospace',
      color: TOKENS.phosphor,
      align: "right",
    });
  }
}
