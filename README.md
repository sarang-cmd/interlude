# Interlude

**Arcade for the wait.** A small, local Chrome extension that puts a cabinet in
Claude’s conversation while an answer is being generated. The game is inline by
default; it is not a separate game window. There is no visible control or tab
on the page between sessions.

> Claude’s DOM is not a public API. The adapter has been tested against local
> structural fixtures, **not an authenticated live Claude session**. Check the
> selectors in Diagnostics before relying on it. ChatGPT and Gemini are
> intentionally inactive interface-only adapters.

## Install an unpacked build

Requirements: Node.js **20.19 or newer** and Chrome/Chromium with Manifest V3
support.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**,
and select this repository’s `dist/` directory. Reload an existing Claude tab
after installing or rebuilding. Alternatively, unzip the supplied extension
archive and load its extracted directory.

1. Open Claude and start a conversation. Send a prompt that takes more than the
   default 500 ms to generate.
2. The cabinet opens below the thinking/streaming indicator. It stays at READY
   until you click the game, use an on-screen control, or focus it with Alt+G
   and press a key. Escape returns focus to the composer.
3. On completion the game freezes and offers **RESUME** or **CLOSE**. Auto-close
   is off by default; when enabled, its default grace is 10 seconds. The explicit
   post-completion/resume state is the only time a cabinet remains after the
   generation signal ends.
4. Use the extension toolbar action for power, Settings and Diagnostics. The
   toolbar popup is a control surface; gameplay is always in the page.

If no cabinet appears, open **Diagnostics**, choose the Claude tab, inspect votes
A/B/C and the matched selectors, and update the ordered JSON candidates there.
Inline mode fails closed rather than placing an unknown overlay over an answer.

## Cabinets

| Cabinet       | Play                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Snake         | Queued turns, walls or wrap, bonus food and increasing speed.                                                      |
| Breakout      | Angle shots, multi-hit bricks, power-ups and levels.                                                               |
| Flapper       | One-button flight through constrained gaps.                                                                        |
| 2048          | Swipe or slide, stepped tile motion, limited undo and best tile; 90-second clock by default (configurable or off). |
| Pong          | Beatable AI, escalating rallies and configurable match length.                                                     |
| Blockfall     | Seven-bag pieces, SRS kicks, lock delay, hold and ghost.                                                           |
| Rockfall Belt | Inertial flight, wrapping, splitting rocks and shields.                                                            |
| Dashline      | Hold for jump height; patterns and speed ramp.                                                                     |

Each game has pointer/touch controls, keyboard support while focused, standard
gamepad mappings, quick restart and a local personal best. The picker defaults to
last played and includes a random option. Implementations are separate lazy
chunks; only the selected game is loaded.

## Privacy and permissions

The Claude adapter observes **structure and timing**, not message contents. It
does not read, store, log or transmit conversation text. Scores, preferences,
selector overrides and overlay position stay in `chrome.storage.local`. There is
no analytics endpoint. The optional stream-timing hook is off by default; when
on, it checks stream-reader completion without inspecting returned chunks. It
is diagnostic only and never votes on generation. The static adapter privacy
guard runs on every build; like any static guard, it is not a substitute for
reviewing changes.

The extension requests storage, scripting (for the optional main-world timing
hook), webNavigation (to tear down on SPA navigation), and site host access. No
message or response content is sent to the background worker. In order to meet
the zero-observer/zero-timer idle budget, the Claude adapter arms discovery on
recognized send/regenerate gestures or detects signals already present at page
load. A generation started **without either** can be missed; see
[architecture](docs/ARCHITECTURE.md#idle-detection-tradeoff).

## Development

```sh
npm run lint
npm run format:check
npm test                 # Vitest, including idle and privacy tests
npm run build            # privacy guard, strict TypeScript, Vite MV3 output
npx playwright install --with-deps chromium  # once on a fresh Linux machine
npm run test:e2e          # built extension, real Chromium, local Claude fixtures
```

The E2E suite routes `https://claude.ai/` to files in `test/fixtures/claude/`;
it does not connect to a real chat or require credentials. On other platforms,
`npx playwright install chromium` may be sufficient. Read
[ARCHITECTURE.md](docs/ARCHITECTURE.md), [ADAPTERS.md](docs/ADAPTERS.md), and
[DESIGN.md](design/DESIGN.md) before changing behavior.

Code is MIT licensed. The bundled fonts are distributed under SIL OFL 1.1;
their individual notices are in `public/fonts/licenses/`.
