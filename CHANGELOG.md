# Changelog

## Unreleased — browser arcade

- Make all eight games playable on the website using the shared canvas engine,
  with keyboard, touch and gamepad controls, pause/reset, optional sound and
  website-local high scores. Gameplay freezes when out of view.
- Add a separate static website build, retaining the existing metadata routes
  and CORS settings. The website arcade does not connect to chat sessions.

## 0.2.0 — staging

- Add a typed, validated, versioned settings catalogue, sync/local fallback,
  per-site profiles, quick drawer, searchable Preact options and live preview.
- Add configurable Focus Guard, local play-time charts, JSON backup and wipe.
- Add best-effort beta ChatGPT and Gemini adapters and multi-site diagnostics.
- Add optional signed selector updates, a rate-limited release checker, and a
  privacy-safe issue report. Metadata is hosted on Vercel; the selector signing
  key is for staging and must be rotated before production use.
- Add serialized cross-tab score, settings and play-time writes; built-output
  privacy checks; CI and checksummed release packaging.
- All three site adapters remain unverified in authenticated live sessions.

## 0.1.0

- Initial Claude structural adapter, eight small arcade games, local scores,
  focus-gated input, timing diagnostics and synthetic browser fixtures.
