# Game modes

The extension runs one player or one player against the CPU. The website uses
the same game code and will load local match modes from web-only modules. A mode
is listed only after its implementation ships. Local matches use one device and
never use networking.

| Game          | Extension | Website | Save a run |
| ------------- | --------- | ------- | ---------- |
| Snake         | Solo      | Solo    | No         |
| Breakout      | Solo      | Solo    | No         |
| Flapper       | Solo      | Solo    | No         |
| 2048          | Solo      | Solo    | No         |
| Pong          | vs CPU    | vs CPU  | No         |
| Blockfall     | Solo      | Solo    | No         |
| Rockfall Belt | Solo      | Solo    | No         |
| Dashline      | Solo      | Solo    | No         |

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
