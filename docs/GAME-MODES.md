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
| DROP FOUR           | vs CPU            | vs CPU, hot-seat               | No         |
| FLIP DISC           | vs CPU            | vs CPU, hot-seat               | No         |
| DRAFTS              | vs CPU            | vs CPU, hot-seat               | No         |
| DOTS AND BOXES      | vs CPU            | vs CPU, hot-seat               | No         |
| FLEET               | vs CPU            | vs CPU, private hot-seat       | No         |
| HAND SIGNALS        | vs CPU            | vs CPU, secret hand-off        | No         |
| SWEEP               | Solo              | Solo, split-screen race        | No         |
| PAIRS               | Solo              | Solo, turn-based match         | No         |
| DARK ROOM           | Solo              | Solo                           | No         |
| SLIDE               | Solo              | Solo, split-screen race        | No         |
| ECHO                | Solo              | Solo, sequence-extension match | No         |
| CODEBREAK           | Solo              | Solo, secret-setter match      | No         |
| QUICK DRAW          | Solo              | Solo, simultaneous duel        | No         |
| LETTERS             | Solo              | Solo, secret-word match        | No         |
| POP                 | Solo              | Solo, split-screen race        | No         |

Scores persist separately on each surface. The existing 2048 undo is not a saved
run. The shared manifest lists default player-one keys, inputs, categories and
estimated run lengths. The settings catalogue and manifest read the same key
binding defaults.

## Toolbar cabinet (unreleased)

The extension popup can open each enabled extension cabinet directly, without a
chat response in progress. Only the selected game is loaded. It uses global
settings and key remaps, while site-specific overrides remain on their sites.
Pong and NOUGHTS AND CROSSES expose CPU level and play/watch controls in the popup;
DROP FOUR, FLIP DISC, DRAFTS, DOTS AND BOXES, FLEET and HAND SIGNALS expose a shared
CPU-level control. Changing them updates
the global settings. Website-only local matches do not
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

All eight original games have a website-only local mode. Unknown or unavailable
modes are rejected. The deployed site and published extension release may lag
behind the source; check their versions separately.

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

## DROP FOUR and FLIP DISC

DROP FOUR is a seven-column, six-row gravity board: X starts, and the first
horizontal, vertical or diagonal line of four wins. FLIP DISC is an eight-by-eight
board: place a disc to bracket and flip at least one opposing run in any
direction. A player with no legal move automatically passes. When neither can
move, the side with more discs wins. Legal FLIP DISC squares are marked with a
dot. Arrows select and Space confirms; pointer and touch can choose the board
directly. The live status reports moves, turns and board rows. FLIP DISC also
announces disc totals.

Each has five shared difficulty levels (Rookie through Veteran), a bounded
minimax search in the same local worker and a visible `CPU: BASIC` fallback if
search fails or exceeds its deadline. The difficulty setting is shared between
the two games on each surface; on the extension it supports per-site overrides.
Neither game claims perfect play. A solo win scores 1,000 plus 10 per remaining
empty square, a draw 200 and a loss zero. Each game has a separate surface-local
best score; the score is not a ranking across difficulty levels. On the website,
a same-device match uses one shared keyboard, gamepad or on-screen control set
and never writes solo scores. Matches are not restored after reload.

## DRAFTS

DRAFTS uses an eight-by-eight English-style draughts board with twelve pieces
per side. Men move diagonally forward, kings move diagonally in both directions,
and captures are compulsory. If a piece can continue jumping it must do so;
reaching the far row crowns a king and ends that move. A player with no legal
move loses. This implementation declares a draw after 80 consecutive
non-capturing moves. Use arrows and Space to select a piece and then a marked
legal destination, or tap each square. The live status announces the board,
selection, legal destinations and capture continuations.

Five shared board CPU levels use bounded local-worker minimax that understands
multiple jumps by the same side. If the worker fails, the first legal move is
used and the canvas shows `CPU: BASIC`. A solo win scores 1,000 plus 100 per
remaining X piece, a draw scores 400 and a loss scores zero. Website hot-seat
shares one control set and never changes solo records. Match state is not saved.

## DOTS AND BOXES

Draw an edge between dots on a four-by-four box board. Completing one or two
boxes claims them and grants another turn; after all 40 edges have been drawn,
the player with more boxes wins. Use left/right to move through the edges,
up/down to jump four edges, Space to draw, or tap/click near an edge. The live
status names the selected edge, whether it is available, the scores and the
number of sides around each unclaimed box. Local website matches share one set
of controls and do not affect solo scores.

The same five shared board CPU tiers use a bounded local-worker search which
accounts for the extra turn after a capture. A simple legal-edge policy is used
if the worker fails; the canvas says `CPU: BASIC` when that happens. A solo
win scores 1,000 plus 50 per box, a draw scores 300 and a loss scores 10 per
box. Scores remain local and a match is not restored after reload.

## FLEET

Each side receives five automatically placed, non-overlapping ships (lengths 5,
4, 3, 3 and 2) on a 10×10 board. Ships may touch. Aim at the target grid with
arrows and Space or tap/click a square. A repeated shot does not consume a turn;
players alternate until one fleet is sunk. The attacking grid reveals only
shots already taken. The status describes the player's own ships and the known
target grid, never unrevealed opposing positions.

The CPU uses the shared five board difficulty tiers and a small bounded local
policy, not the search worker. It receives only previously revealed shot
outcomes: it cannot inspect unshot ship positions. A win scores 2,500 minus 10
per shot (minimum 100); a loss scores zero.

Website hot-seat starts with a full privacy screen for player 1. After each shot
the board is immediately hidden and the device is passed to the next player,
who presses Space or taps to reveal their own fleet and attack grid. Pausing or
hiding the tab re-covers the current board. The hand-off screen reports only
whether the preceding shot missed, hit or sank a ship, not board positions.
It is a visual hand-off aid, not protection against someone watching or
inspecting browser memory. Fleets and match state are not saved; local matches
never write solo records.

## HAND SIGNALS

Choose rock, paper or scissors with the keyboard, gamepad, on-screen controls
or by tapping a signal. An optional Lizard Spock setting adds two signals and
uses the standard five-gesture relationships; changing rules starts a new match.
The first to five round wins takes the match; draws do not award a point.
The CPU commits before the player chooses and uses only previous choices, never
the current selection. Higher shared difficulty levels are more likely to try
countering frequent earlier choices; they are not guaranteed to win.

On the website two players share one device, choosing in secret behind a
hand-off screen. The signals are revealed only after both have chosen. Pausing
or hiding while choosing returns to the screen. As with FLEET, this is a visual
hand-off aid, not a defense against a person watching or inspecting memory. No
match state is saved and local matches never write solo records.

## LETTERS

Guess a word one letter at a time. Arrows move around the alphabet, Space
selects a letter, and a tap selects and guesses it directly. All copies of a
correct letter appear; repeating a guess costs nothing. Six distinct wrong
guesses end the run, revealing the answer. A solo win scores 1,000 plus 150
for each unused guess; a loss scores zero. All three solo list sources share
the ordinary LETTERS best score, so scores are not comparable across lists.

The general and study lists each have 36 bundled words. Paste a custom list in
the cabinet controls: 1–100 entries, each 2–24 ASCII letters A–Z, separated by
commas, semicolons or new lines, with a 4,000-character total limit. Entries
are case-insensitive and duplicates are removed. Invalid input leaves the last
valid source in place. Applying a source resets an unfinished word; after a
completed game, it applies on retry. The selected custom list stays only in
memory with that cabinet instance, survives retries, and is not saved or sent by
the app. Resetting or switching games replaces the instance; closing an in-page
panel can leave its instance in memory until a later selection or tab reload.
The popup's Back or close ends its instance. Avoid sensitive words in an in-page
cabinet: a host page may observe input events.

On the website, choose the secret-word match: after Start, player 1 enters a
single word into a password-masked input and passes the device behind a privacy
screen for player 2 to guess. The input clears on submission or tab hiding; the
screen returns on pause or hiding. The answer is revealed when the run ends.
The match does not write solo records. Neither the mask nor the hand-off screen
is a security boundary against a person watching or inspecting browser memory.

## QUICK DRAW

Wait for the GO cue, then press Space or tap. Pressing early is a false start;
not responding within four game seconds ends the run. The score rewards a
quicker response. The timing is approximate game-time milliseconds, not a
laboratory reaction-time measurement: browser scheduling, display refresh,
input latency and the selected game speed affect the result.

In the website-only duel both players see the same cue. Player 1 uses F and
player 2 J, or the separate on-screen controls; the first registered draw
wins and a false start gives the other player the win. Browser event order
breaks near-simultaneous ties. The duel does not write solo records.

## CODEBREAK

Guess a four-digit code made from digits 1–6, with repeats allowed. Arrows select
and change digits, tapping a digit cycles it, and Space submits. Each of ten
attempts reports how many digits are exact matches and how many more are
present in the wrong position, counting repeated digits only once each. In solo
mode the code is chosen locally at random.

On the website a second mode lets one player set the code in a password-style
input after pressing Start, then pass the device behind a hand-off screen for
the other player to guess. The input is cleared after submission and when the
tab is hidden. The code and guesses are not stored or sent anywhere, and the
match never changes solo records. The hand-off screen is a visual aid, not a
security boundary against someone watching or inspecting browser memory.

## DARK ROOM

Explore a procedurally generated maze with arrows, swipes, or by tapping an
adjacent square. The visible area is limited, but explored corridors remain
dimly visible. Find the key before returning to the exit. The maze is generated
locally, and the live status describes nearby passages without revealing the
unseen layout. There is no saved run or local multiplayer mode.

## PAIRS and ECHO

PAIRS has eight shuffled pairs on a 4×4 board. Flip two cards using arrows and
Space, or tap them. Matching cards remain visible; an incorrect pair briefly
shows before turning back over. The website's two-player game awards one point
and another turn for a match; a mismatch passes the turn. The most pairs wins.

In solo ECHO, watch the four labelled pads flash, then repeat them using the
corresponding arrow keys or by tapping. A new signal is added after each correct
round; the first incorrect signal ends the run. The website's local version
starts with player 1 adding a signal. Each subsequent player repeats the entire
sequence and then adds one signal for the other player to remember. A mistake
loses; reaching 64 signals ends in a draw. Both local modes use shared controls
and never write solo records.

## SWEEP, SLIDE and POP

SWEEP is a 9×9 minefield with ten mines. The first opening and its neighbors
are always safe; empty areas open automatically. Arrow keys move the cursor,
Space opens, C flags, and tapping opens a square. Clear all safe squares to win;
flags are optional. Each safe square is worth 10 points and a clear adds 1,000.

SLIDE is a solvable 4×4 sliding puzzle with tiles 1–15 and one gap. Arrow keys
move the gap; tapping a neighboring tile swaps it with the gap. Progress points
reflect total tile distance from the solved arrangement; completion awards a
larger bonus, reduced by the number of moves.

POP is a 45-game-second target game: move the cursor and press Space, or tap a
lit target. A hit is worth 100 points and a miss costs 10, never below zero.
Targets move periodically; the accessible status gives their positions.

On the website all three have independent seeded split-screen races with
separate controls, handicaps and local records. Each side starts with the same
seed; different first selections in SWEEP or different play in POP can cause
boards to diverge. These races do not change solo scores.

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
minimax, Monte Carlo playouts and a terminating worker client. NOUGHTS AND CROSSES,
DROP FOUR, FLIP DISC, DRAFTS and DOTS AND BOXES use the local board-search worker; Pong uses the reaction and adaptive helpers
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
