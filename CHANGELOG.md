# Changelog

## Unreleased / browser arcade

- Add a playable toolbar popup with lazy-loaded enabled cabinets, local scores,
  CPU controls and the same global pause and Focus Guard restrictions. Closing
  the popup ends the run; it does not save game state.
- Add QUICK DRAW with a shared-cue two-player duel on the website.
- Add CODEBREAK with a website-only hidden-code setter and hand-off screen.
- Add DARK ROOM, a solo maze with a key and exit.
- Add PAIRS and ECHO, including website-only turn-based modes.
- Add SWEEP, SLIDE and POP with solo play on both surfaces and seeded
  split-screen races on the website.
- Add HAND SIGNALS with optional Lizard Spock, a CPU that commits before each
  turn and a website-only secret-choice hand-off mode.
- Add FLEET against an information-only CPU on both surfaces and a website-only
  hot-seat match with a privacy screen between turns.
- Add DROP FOUR, FLIP DISC, DRAFTS and DOTS AND BOXES on both surfaces with shared five-level CPU
  difficulty and website-only shared-board matches. Searches run locally in a
  bounded worker; local matches do not change solo scores.
- Add NOUGHTS AND CROSSES on both surfaces with 3×3, 4×4 and 5×5 boards,
  five CPU levels, CPU watch and a website-only shared-board hot-seat mode. A bounded local worker performs
  search; watch and hot-seat matches do not write solo scores.
- Add website-only local Pong, split-screen races for the other seven original
  cabinets, and shared-board 2048 co-op. Add Pong CPU tiers, optional adaptive
  difficulty, CPU watch and per-game speed controls.

- Make all eight games playable on the website using the shared canvas engine,
  with keyboard, touch and gamepad controls, pause/reset, optional sound and
  website-local high scores. Gameplay freezes when out of view.
- Add a separate static website build, retaining the existing metadata routes
  and CORS settings. The website arcade does not connect to chat sessions.

## 0.2.0 / staging

- Add a typed, validated, versioned settings catalogue, sync/local fallback,
  per-site profiles, quick drawer, searchable Preact options and live preview.
- Add configurable Focus Guard, local play-time charts, JSON backup and wipe.
- Add best-effort beta ChatGPT and Gemini adapters and multi-site diagnostics.
- Add optional signed selector updates, a rate-limited release checker, and a
  privacy-safe issue report. Metadata is hosted on Vercel; the selector signing
  key is for staging and must be rotated before production use.
- Add serialized cross-tab score, settings and play-time writes; built-output
  privacy checks; CI and checksummed release packaging.
- Site adapters use structural signals. ChatGPT and Gemini are beta.

## 0.1.0

- Initial Claude structural adapter, eight small arcade games, local scores,
  focus-gated input, timing diagnostics and synthetic browser fixtures.
