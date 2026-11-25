# Interlude — Design Rules

**Direction:** restrained CRT arcade. Amber phosphor on near black. The back of a
1982 arcade cabinet service manual, not a neon synthwave poster.

## Palette

Defined as CSS variables in `design/tokens.css` and mirrored in `design/tokens.ts`.

| Token              | Value                 | Use                                         |
| ------------------ | --------------------- | ------------------------------------------- |
| `--ink`            | `#0E0B07`             | panel background, near black                |
| `--ink-2`          | `#171209`             | raised surface (header strip, buttons)      |
| `--ink-3`          | `#221A10`             | hover / pressed surface                     |
| `--phosphor`       | `#FFB000`             | primary amber: borders, titles, active text |
| `--phosphor-dim`   | `#7A5600`             | hairlines, secondary text, disabled         |
| `--phosphor-hot`   | `#FFD36B`             | scores, hot highlights                      |
| `--phosphor-faint` | `rgba(255,176,0,.14)` | glow fill behind ready/done states          |
| `--paper`          | `#E9DFC8`             | light surfaces only (never on dark panel)   |
| `--paper-ink`      | `#2A2118`             | text on paper                               |
| `--signal-red`     | `#D6452B`             | death, destructive. Never decorative.       |
| `--signal-green`   | `#5FBF6A`             | confirmed / high score. Never decorative.   |

Hard bans: no purple. No blue→purple gradients. No glassmorphism. No rounded
cards with soft shadows. If a surface needs depth, use a stepped pixel shadow
(`--shadow-step-1`, `--shadow-step-2`) and square corners.

## Type

- **Silkscreen** (self-hosted woff2, `public/fonts/silkscreen-*.woff2`): titles,
  scores, READY / GAME OVER. Chunky pixels, small sizes only.
- **VT323** (self-hosted): CRT readout text inside the game canvas.
- **IBM Plex Mono** (self-hosted, 400/600): body, labels, controls, settings.

Never Inter, Roboto, Arial, Helvetica, or system-ui stacks. No network font
fetches of any kind — the extension must work offline in the page.

## Shape & texture

- Hard 1px (`--border-1`, dim) or 2px (`--border-2`, phosphor) borders.
- Square corners everywhere. No `border-radius` except 0.
- Hairline dividers between header / playfield / footer.
- Pixel shadows are solid offset blocks, not blurred.
- **Scanlines and phosphor bloom exist ONLY inside the game canvas.** Never over
  settings text, popup, landing page, or diagnostics.

## Motion

- Stepped, not eased. Use `steps()` timing functions (`--steps-fast`, `--steps-med`).
- One boot sequence: POWER-ON flicker under 250 ms, once per panel mount.
  Skippable via the `reduceMotion` / `skipBoot` setting. Never replayed.
- No other decorative animation. State changes cut or step; they do not fade.

## Voice

Short, dry, arcade-manual language. Examples of correct voice:

- `INSERT COIN`
- `PLAYER 1`
- `CLAUDE IS DONE. RESUME?`
- `NO SIGNAL`
- `HI-SCORE`

Incorrect voice: marketing fluff, exclamation marks, "seamless", "experience",
"delight", emojis. Write like the service manual of a machine that would rather
be left alone.

## Panel anatomy (shadow DOM)

```
+--------------------------------------+  2px phosphor border
| INTERLUDE        HI 0000    [II][x]  |  header strip, IBM Plex Mono, hairline below
+--------------------------------------+
|                                      |
|             GAME CANVAS              |  640x360 logical, integer scaled
|      (scanlines + bloom live here)   |
|                                      |
+--------------------------------------+
| READY / GAME OVER overlays on canvas |
+--------------------------------------+
```

Footer line is a single hairline + tiny dim status text, e.g. `ALT+G FOCUS · ESC RELEASE`.
