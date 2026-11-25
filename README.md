# Interlude

**Arcade for the wait.** Interlude is a Manifest V3 Chrome extension that puts a
small game in the margins while an AI response is generating. Its restrained
amber CRT cabinet stays hidden while the site is idle.

> **Live verification:** Claude, ChatGPT and Gemini selectors were exercised on
> synthetic fixtures, not authenticated live sessions. ChatGPT and Gemini are
> explicitly **BETA**. Real sites change; use Diagnostics and the
> [ten-minute checklist](docs/TEST_PLAN.md) before relying on any adapter.

## Install

1. Download a release zip and verify it against `SHA256SUMS.txt`, or build it:
   `npm ci && npm run build` (Node.js **20.19+**).
2. Extract the zip. In `chrome://extensions`, enable Developer mode, choose
   **Load unpacked**, and select the extracted folder containing `manifest.json`
   (or the repository's `dist/` after building).
3. Reload an existing Claude, ChatGPT or Gemini tab once after installation.
   Start a conversation and send a prompt taking more than 500 ms. The cabinet
   appears below the recognized thinking indicator. If no safe inline anchor is
   found, it stays hidden instead of covering the response.
4. Click the game, or press **Alt+G** and a game key. **Escape** returns focus to
   the composer. When a response finishes, the run freezes; resume or close it.
   Auto-close is on by default with a **10-second** grace period.

The toolbar popup offers **pause for one hour**, **pause until tomorrow**, and
an options link; the first button becomes **resume now** during a pause. The
cabinet's gear opens quick controls for game, volume, size and placement.
**Options** has searchable categories, individual/section resets, a changed-only
filter, Global/Claude/ChatGPT/Gemini profiles and a playable non-recording
preview. Site-specific values override global values, then schema defaults.
Settings apply live; extension installation or replacement itself requires the
normal one-time tab reload.

## Cabinets

| Game          | Play                                                          |
| ------------- | ------------------------------------------------------------- |
| Snake         | Queued turns, optional wrap, bonus food.                      |
| Breakout      | Angle shots, bricks, power-ups and levels.                    |
| Flapper       | One-button flight through gaps.                               |
| 2048          | Slide, merge, undo and best tile; 90-second clock by default. |
| Pong          | Configurable AI and match length.                             |
| Blockfall     | Seven-bag pieces, kicks, hold and ghost.                      |
| Rockfall Belt | Inertial flight, splitting rocks and shields.                 |
| Dashline      | Tap or hold to vary jump height.                              |

Each cabinet has configurable enablement, speed, difficulty, mute and key
bindings. Keyboard input is focus-gated; pointer, touch and standard gamepad
controls can be switched independently. The game picker supports last played
and random among enabled games.

## Focus Guard and data

Only active play is counted; paused and hidden-tab time does not count. Daily
play records and scores are local. Optional budgets, threshold nudges, quiet
hours, Study Mode and a session summary are available in Options. **Budgets,
nudges and lockout are off by default.** If a user explicitly enables lockout,
the cabinet shows `OUT OF COINS. BACK TO WORK.` at the budget and will not open
until the next local day or lockout is disabled. Multiple active tabs share
serialized play-time totals. Export/import settings and local records as JSON or
confirm a wipe under **Data**. Close supported chat tabs first so they cannot
write new records. If Chrome sync cannot be cleared, the UI reports the partial
wipe and asks you to retry; a local fallback prevents old settings reappearing.

## Diagnostics and privacy

Options → **Diagnostics** shows the selected site's structural signals,
selector fallback matches, mount, state, recent timeline, host theme, measured
signal-to-frame time and remote-check status. A clean report and prefilled
GitHub issue omit chat text, page titles and URLs, selector text and account
information. Review before sharing. The selector bench accepts structural CSS
candidates and applies local overrides immediately.

Adapters inspect DOM **structure and timing**, not conversation content. There
is no analytics. Settings use `chrome.storage.sync` where available with a local
fallback; scores, statistics, local selector overrides and response-time averages
stay in local storage. An optional timing-only stream hook is off by default;
it never reads chunks or votes on generation.

An optional signed selector check is off by default; an optional release check is
on by default. Both use static credential-free GETs with no application-added
identifiers or custom headers. Browsers and servers still see ordinary network
metadata. The static metadata service is hosted at
`https://interlude-sepia.vercel.app`. **The selector feed is signed with a
staging key and is not production-ready**; leave it off until the key is rotated
securely offline. See [privacy](docs/PRIVACY.md) and
[security/key handling](docs/SECURITY.md).

## Development and release

```sh
npm ci
npm run format:check && npm run lint && npm run typecheck
npm test                         # Vitest, including fake-clock and privacy tests
npm run build                    # source and built-extension privacy audits
npx playwright install --with-deps chromium
npm run test:e2e                 # real extension, synthetic site fixtures
npm run package:release -- v0.2.0 # versioned zip, latest zip, SHA-256 file
```

The CI workflow runs these checks and publishes the **validated** build to a
GitHub Release on a matching `vX.Y.Z` tag. A tag must match `package.json` and
`manifest.json`. The public repository is
[github.com/sarang-cmd/interlude](https://github.com/sarang-cmd/interlude).
See [contributing](CONTRIBUTING.md),
[architecture](docs/ARCHITECTURE.md), [adapters](docs/ADAPTERS.md),
[design rules](design/DESIGN.md) and [changelog](CHANGELOG.md).

MIT licensed. Bundled fonts are SIL OFL 1.1; notices are in
`public/fonts/licenses/` and included in the built extension.
