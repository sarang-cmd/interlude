# Game modes

The extension runs one player or one player against the CPU. The website uses
the same game code and will load local match modes from web-only modules. A mode
is listed only after its implementation ships. Local matches use one device and
never use networking.

| Game          | Extension         | Website           | Save a run |
| ------------- | ----------------- | ----------------- | ---------- |
| Snake         | Solo              | Solo              | No         |
| Breakout      | Solo              | Solo              | No         |
| Flapper       | Solo              | Solo              | No         |
| 2048          | Solo              | Solo              | No         |
| Pong          | vs CPU, watch CPU | vs CPU, watch CPU | No         |
| Blockfall     | Solo              | Solo              | No         |
| Rockfall Belt | Solo              | Solo              | No         |
| Dashline      | Solo              | Solo              | No         |

Scores persist separately on each surface. The existing 2048 undo is not a saved
run. The shared manifest lists default player-one keys, inputs, categories and
estimated run lengths. The settings catalogue and manifest read the same key
binding defaults.

## Build boundary

`__PLATFORM__` is a compile-time literal. The extension build rejects any module
from `src/twoplayer/` or any `*.2p.ts` module. Local-mode metadata and settings
belong in those web-only modules, never in the shared settings schema. Each build
emits `bundle-report.json` with JavaScript byte counts and budget limits. The
website build must include the local-mode registry, so the separation check does
not pass solely because both builds dropped the registry.

No local modes are included yet. The registry returns an empty list until a
playable mode and tests are added. Unknown or unavailable modes are rejected.

## Pong AI and speed

Pong has five CPU levels: Rookie, Easy, Regular, Hard and Veteran. The three
original values still load from existing settings. Optional adaptive difficulty
moves one tier after three consecutive points by the same side and resets when
the chosen base level changes. Watch mode controls both paddles. A run touched
by a bot never changes a human record, even if watch mode is later switched off.

The website offers 25%, 50%, 75%, 100%, 125%, 150%, 200%, 300% and 400%
speeds per game. Extension settings also accept other multiples of five within
25% to 400%. The engine subdivides fast updates to keep each physics step at or
below the normal fixed-step size. Site preferences remain in localStorage.

The reusable AI library includes seeded error and reaction helpers, bounded
minimax, Monte Carlo playouts and a terminating worker client. The worker has a
three-in-a-row search task for later board games. Pong uses the reaction and
adaptive helpers directly and does not start a worker.

## Pong simulation

A scripted player followed the ball at a maximum 380 pixels per second and
played 25 seeds per level, first to five points, with a 120-second cap. Results
below measure one deterministic script, not human ability or game feel. Run
`npx tsx scripts/simulate-pong.ts` to reproduce the table.

| CPU     | Script wins | Unfinished at 120 s | Mean seconds |
| ------- | ----------: | ------------------: | -----------: |
| Rookie  |          25 |                   0 |         42.5 |
| Easy    |          25 |                   0 |         54.2 |
| Regular |          25 |                   0 |         60.7 |
| Hard    |          25 |                   0 |         85.3 |
| Veteran |          23 |                   2 |        101.4 |
