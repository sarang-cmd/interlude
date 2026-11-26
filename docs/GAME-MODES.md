# Game modes

The extension runs one player, one player against the CPU, or a CPU watch match.
The website uses the same game code and loads local match modes from web-only
modules. A mode appears only after implementation. Local matches use one device
and never use networking.

| Game                | Extension         | Website                        | Save a run |
| ------------------- | ----------------- | ------------------------------ | ---------- |
| Snake               | Solo              | Solo, split-screen race        | No         |
| Breakout            | Solo              | Solo, split-screen race        | No         |
| FLAPPY-STYLE FLYER  | Solo              | Solo, split-screen race        | No         |
| 2048                | Solo              | Solo, race, shared-board co-op | No         |
| Pong                | vs CPU, watch CPU | vs CPU, watch CPU, local match | No         |
| Blockfall           | Solo              | Solo, split-screen race        | No         |
| Rockfall Belt       | Solo              | Solo, split-screen race        | No         |
| ENDLESS RUNNER      | Solo              | Solo, split-screen race        | No         |
| NOUGHTS AND CROSSES | vs CPU, watch CPU | vs CPU, watch CPU, hot-seat    | No         |

Scores persist separately on each surface. The existing 2048 undo is not a saved
run. The shared manifest lists default player-one keys, inputs, categories and
estimated run lengths. The settings catalogue and manifest read the same key
binding defaults.

## Toolbar cabinet (unreleased)

The extension popup can open each enabled extension cabinet directly, without a
chat response in progress. Only the selected game is loaded. It uses global
settings and key remaps, while site-specific overrides remain on their sites.
Pong and NOUGHTS AND CROSSES expose CPU level and play/watch controls in the popup;
changing them updates the global settings. Website-only local matches do not
appear there. Human runs use ordinary extension-local high scores; CPU watch
runs do not. Active popup play contributes to the same local Focus Guard totals
as site cabinets, and global pause, study, quiet hours and budget lockout apply.
Back or closing the popup destroys the game and ends the run; there is no saved
or restored state. The popup is not part of the published release yet.

## Build boundary

`__PLATFORM__` is a compile-time literal. The extension build rejects any module
from `src/twoplayer/` or any `*.2p.ts` module. Local-mode metadata and settings
belong in those web-only modules, never in the shared settings schema. Each build
emits `bundle-report.json` with JavaScript byte counts and budget limits. The
website build must include the local-mode registry, so the separation check does
not pass solely because both builds dropped the registry.

All eight original games now have a website-only local mode. Unknown or
unavailable modes are rejected. These changes are local to this branch and are
not deployed to the public site.

## NOUGHTS AND CROSSES

X begins. Choose 3×3 (three in a row) or 4×4 or 5×5 (four in a row); the
larger sizes include diagonals and sliding four-cell segments. Changing size
starts a fresh match. On both surfaces, play X against the CPU's O or watch two
CPUs. On the website, two people can take turns on the same board using the same keyboard,
controller or on-screen controls; a pointer or touch can select a square
directly. The hot-seat match uses one shared control mapping: it has no separate
player names, series scoreboard, local match history or per-player remaps.
It is not a split-screen race. It never changes solo high scores.

The CPU has Rookie, Easy, Regular, Hard and Veteran tiers, each with a bounded
minimax search depth and seeded error rate. On 3×3 with a functioning worker,
Veteran searches every remaining move and never deliberately makes a mistake. A
unit test explores every opponent reply against the deterministic 3×3 Veteran on
both sides. The larger boards use shallower bounded searches and are not
claimed to be unbeatable. If the worker is blocked, fails or times out, a small tactical fallback
first attempts an immediate win or block and otherwise chooses a legal square.
The canvas shows `CPU: BASIC` and the accessible status says `using fallback`;
that fallback is not guaranteed unbeatable. Watch or partly watched runs never
write human records. In a human-versus-CPU game, a win scores 1,000 plus 50 per
empty square, a draw scores 200 and a loss scores zero. The best score is local
to the surface, not a ranking across difficulty levels.

Arrow keys move the highlighted square and Space places a mark. The board's
live accessibility status describes each move, the selected cell and every
row; an occupied cell does not advance the turn. P pauses. Match state is not
saved across reloads. The webpage persists board size, CPU level and watch preference in
localStorage; the extension uses its normal validated settings store.

### CPU simulation

Run `npx tsx scripts/simulate-tictactoe.ts` for 300 seeded 3×3 games per tier: a
random X against CPU O. This is one artificial opponent, not a human playtest.
Veteran's safe, deterministic tie-breaking leads to more draws rather than
maximizing wins against random mistakes.

| CPU     | CPU wins | Random X wins | Draws |
| ------- | -------: | ------------: | ----: |
| Rookie  |      204 |            51 |    45 |
| Easy    |      217 |            34 |    49 |
| Regular |      253 |            13 |    34 |
| Hard    |      267 |             4 |    29 |
| Veteran |      248 |             0 |    52 |

## Split-screen races

Snake, Breakout, FLAPPY-STYLE FLYER, 2048, Blockfall, Rockfall Belt and ENDLESS RUNNER offer
competitive races. The engine runs two independent instances of the existing
solo game at once, not a second arcade or a shared-board co-op mode. Both boards
receive the same seed at the start of a round. Player actions affect later
random draws, so boards need not stay identical. Each completed round increments
the seed. Resetting a series restores the configured starting seed.

Each player has remappable keys, separate touch controls and a gamepad slot.
Defaults use W/A/S/D, F and Q for player one and arrows, Space and Enter for
player two. Only actions used by a game appear. Conflicts and the P pause key
are rejected. Assigned gamepad slots stay with the same player if the other
controller disconnects. Names, a 30 to 300 game-second clock, best-of-one,
three or five, and score handicaps of 100%, 125%, 150% or 200% are configurable
between rounds. Speed settings scale the game clock as well as the games.

The higher adjusted score wins. If adjusted scores match, longer survival wins.
Equal scores and survival produce a draw, which does not advance the series.
An eliminated board freezes while the other continues until its game ends or
the clock expires. The solo 2048 clock is off during a race so both boards use
the shared race clock. No local race updates a solo high score or best tile.
The last 100 race results and per-game preferences stay in browser storage. The
active scoreboard resets on reload. Race data is never transmitted. Private
hot-seat games are not part of these race modes.

## Shared-board 2048 co-op

Two players share one 2048 board and alternate after each valid move. Both work
toward one configurable tile target. Invalid moves leave the turn unchanged.
The current player may spend a shared undo to restore the previous board and
return the turn to the previous player. The same 2048 merge and seeded spawn
logic runs on both surfaces. This mode contains no hidden information.

The team chooses names, key bindings, a seed, target tile, undo count and a
30 to 300 game-second clock between rounds. Two controller slots remain assigned
for the round. Touch controls enable the active player's row. A win or loss is
recorded when the target is reached, no legal move remains, or the clock runs
out. Up to 100 team results stay in browser storage, apart from solo records.
The team tally resets on reload. A rematch increments the seed. P pauses and
all gameplay remains on one device.

## Local Pong

The website has a same-device match with two paddles. Default keys are W/S and
Up/Down. Both sets of keys work at once. Four remappable actions reject
conflicts and reserve P for pause. Two connected gamepads use the first pad for
player one and the second for player two. Touch buttons are available for both
players. Players choose names and individual paddle speeds of 70%, 100% or
130%.

A match uses the shared Pong physics and a configurable seed. The opening
serve uses the same seeded angle and alternates sides after each round. A series
runs best of one, three or five matches. The on-screen scoreboard offers
rematches and a series reset. Up to 100 match results and the local control
preferences stay in browser storage, separate from single-player scores. The
current series scoreboard resets on reload. No match data is transmitted.

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
minimax, Monte Carlo playouts and a terminating worker client. NOUGHTS AND CROSSES uses
the local three-in-a-row worker; Pong uses the reaction and adaptive helpers
directly and does not start a worker. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the extension-origin worker bridge and cancellation behavior.

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
