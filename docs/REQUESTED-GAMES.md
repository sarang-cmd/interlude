# Requested game roster

This is the user's final authoritative roster. Parenthetical terms describe a
genre, not an alternative game title. Keep existing internal IDs and stored data
compatible; use the exact display titles below. Do not substitute other games.

## Existing eight

1. SNAKE
2. BREAKOUT
3. FLAPPY-STYLE FLYER
4. 2048
5. PONG
6. BLOCKFALL
7. ROCKFALL BELT
8. ENDLESS RUNNER

## Sixteen new games

1. NOUGHTS AND CROSSES — 3×3, 4×4 and 5×5; four in a row on the larger boards
2. DROP FOUR — 7×6 board
3. FLIP DISC — 8×8
4. DRAFTS
5. DOTS AND BOXES
6. FLEET
7. HAND SIGNALS — optional Lizard Spock toggle
8. SWEEP
9. PAIRS
10. DARK ROOM
11. SLIDE
12. ECHO
13. CODEBREAK
14. QUICK DRAW
15. LETTERS — general and study lists and a paste-your-own list
16. POP

The first seven are turn-based games with AI using the shared `src/ai/` toolkit.
Solo and versus-AI modes run on both the extension and web arcade. Local
two-player and co-op implementations are website-only; the extension build
must contain no two-player code. Requested web-only modes include FLEET hot
seat with a privacy screen; CODEBREAK with one player setting the code; LETTERS
with one player entering a word in a hidden input; QUICK DRAW two-player duel;
ECHO turn-based sequence extension; SWEEP, SLIDE and POP races; and PAIRS
turn-based two-player. The public arcade currently runs an older build; none of
the unreleased local work should be represented as deployed.

## Implementation status

The eight existing cabinets, NOUGHTS AND CROSSES, DROP FOUR, FLIP DISC, DRAFTS,
DOTS AND BOXES, FLEET, HAND SIGNALS, SWEEP, PAIRS, DARK ROOM, SLIDE, ECHO, CODEBREAK, QUICK DRAW and POP are implemented locally. NOUGHTS AND CROSSES has all
three requested sizes; DROP FOUR uses 7×6 and FLIP DISC 8×8. Each has a
website-only hot-seat mode, and FLEET uses a privacy screen at hand-off. The
remaining title and their requested modes are not yet implemented or
deployed. This document is a scope record, not a claim that unfinished work has
shipped.
