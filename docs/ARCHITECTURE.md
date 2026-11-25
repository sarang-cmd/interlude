# Architecture

## Boundaries

```text
MV3 classic content bootstrap → extension-owned ES module
  → discovered site plugin → structural adapter → generation state machine
  → controller → closed-shadow cabinet → engine → one lazy game module
  → local scores / serialized Focus Guard statistics
extension service worker → validated, serialized settings writes / alarms
options (Preact) → schema / profiles / playable preview / embedded diagnostics
```

The standalone website reuses the same canvas engine and lazy game registry,
but not the extension's site adapters or Chrome storage. Its website-only score
adapter uses localStorage when available; the engine runs in preview mode so it
never writes extension scores or 2048 tile records. Hidden or offscreen website
games stop their loop until visible again. Website scores and extension scores
are separate.

`vite.website.config.ts` bundles `deployment/index.html` and `deployment/arcade.ts`
into the static `deployment/web-dist/` directory, together with the two public
JSON routes and licensed fonts. Only explicitly public assets are copied; the
signing key is never part of the site build. Vercel's `deployment/` project root
must allow source files outside the root so the build can use the repository's
shared code and lockfile. `deployment/vercel.json` retains the metadata CORS
headers. No server runtime is needed for gameplay.

The three implemented plugins live in `src/adapters/{claude,chatgpt,gemini}`.
ChatGPT and Gemini are beta. `public/manifest.json` limits scripts and
web-accessible extension resources to the three hosts. Fonts and game assets are
bundled; no network fonts. The options preview uses the same engine but neither
score nor 2048 best-tile writes are persisted.

## Game catalog and build surfaces

`src/games/manifest.ts` describes the shipped games and their shared modes.
Player-one binding defaults come from `src/games/catalog.ts`, also used by the
settings schema. The website loads the web-only mode registry lazily. The
extension build substitutes `__PLATFORM__` with `extension`, removes the web
branch, and rejects any chunk containing `src/twoplayer/` or `*.2p.ts` modules.
The web build requires the registry. Both builds enforce JavaScript budgets and
emit a bundle report. See [GAME-MODES.md](GAME-MODES.md) for shipped modes.

## Detection and lifecycle

`idle → starting → generating → finishing → idle` is implemented in
`src/adapters/claude/stateMachine.ts` and shared by the structural adapters.

- Signal A is a stop control within a composer; B is an indicator in the latest
  active assistant turn; C is recent structural mutation timing. Two enabled
  votes assert generation where possible. D is optional stream timing and never
  votes. User-selected signal sets and the regenerate switch apply live.
- Recognized send/regenerate intent arms bounded observation before the site's
  handler runs. A generation already in progress on initial page load is also
  detected. Latest-turn selection combines candidates, collapses nested matches
  and excludes inactive/hidden branches.
- A pending reveal honors the configurable 0–5000 ms delay, expected-wait,
  short-reply, first-message, focus, schedule and site-enable policies. A
  completed short reply normally never flashes the panel. Missing anchors fail
  closed; active structural changes can retry or remount the same host.
- The response completing freezes play before RESUME/CLOSE controls appear.
  Auto-close is on by default with a 10-second grace. Hidden tabs stop the loop;
  offscreen panels use a reduced rate. Pause, disable, navigation and teardown
  cancel the appropriate work. Fonts, panel and games never read message text.
- Active root/turn observers and detector timers are disconnected at idle. This
  intentionally means a wholly programmatic generation with no recognized
  gesture and no signal present at load **can be missed**. There is no permanent
  background DOM discovery poll. Assistant-message-only fallbacks can anchor
  after an entire message, not a verified separate indicator.

`public/page-bridge.js` wraps history methods in the MAIN world to announce SPA
navigation without reading route arguments. The off-by-default stream hook is
installed only after opt-in and observes event-stream open/close timing and the
reader's `done` boolean, never URL, request body or chunk values. Disabling it
immediately stops observation; a harmless pass-through wrapper may remain until
the page reloads. Unusual consumption paths may not report close and unrelated
event streams can be seen, so D cannot trigger gameplay.

## Settings and data

`src/settings/schema.ts` is the catalogue for metadata, defaults, constraints,
dependencies, site scope and UI. The v2 document migrates legacy flat settings;
invalid/unknown values are silently dropped. Resolution is site override →
global → default. Chrome sync is attempted with a local mirror/fallback.
Window contexts send settings mutations to a service-worker queue, preventing
independent profiles from overwriting one another during normal concurrent use.
A shutting-down extension may fall back to local writes.

The panel gear changes a small subset; the full Preact options surface supports
search, changed-only, per-setting and section resets, profiles, and a live game
preview. Scores and play statistics remain local. JSON import validates settings,
scores and statistics; wipe is confirmed. User-supplied local selector overrides
are applied above signed or bundled candidates. Cached remote selectors are
reverified in each content context and can be switched on/off without reload.

## Focus Guard

`src/focus/guard.ts` is a clock-injected calculation engine. It counts actual
`playing` time, splits at local midnight, computes optional budget/nudges and
cross-midnight quiet/study schedules, and never penalizes by default. The
controller ticks only while a visible game is playing; pause/hidden/close stops
accounting. The service worker serializes per-game deltas across tabs. A tab
reconciles storage changes arriving during an in-flight write, including notices
and locks when another tab crosses a threshold. A lock displays
`OUT OF COINS. BACK TO WORK.` and blocks games until the next local day or the
user disables lockout/budget. The one-second accounting cadence and browser
suspension mean it is a gentle aid, not a tamper-proof time-control system.

## Remote metadata and release

A single `fetchStaticJSON` transport makes only GET requests with credentials
omitted, no referrer, no custom headers or body, no redirects, an eight-second
timeout and a 200 KB cap. Signed selectors (off by default) are checked at most
once per 12 hours; release metadata (on by default) at most once per 24 hours.
Signature, schema, dates and rollback are validated before replacing the last
good selector cache. The release URL is restricted to the matching official
GitHub artifact. Alarms and on-wake checks share stored timestamps. There is no
automatic download. The static metadata routes are hosted on Vercel with CORS.
The selector signing key is staging-only and needs offline rotation before
production use; see [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

## Verification and limitations

Unit tests exercise schema/migrations, fake-clock Focus Guard, signatures,
network policy, input and games. Playwright loads the built extension on local
synthetic pages for all three hosts, including multi-tab budgets and diagnostics.
The source privacy guard and conservative built-output audit are automated; they
are not a formal proof. No authenticated live-site compatibility or human game
feel has been established. The normal-profile human checklist is in
[TEST_PLAN.md](TEST_PLAN.md).
