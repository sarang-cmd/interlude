# Architecture

## Boundaries

```text
classic MV3 content bootstrap
  → extension-owned ES module
    → site plugin → Claude structural observer → two-of-three state machine
    → controller → closed-shadow panel → engine → one lazy game module
    → extension-local settings / score store
```

`public/content.js` is a classic MV3 content script and imports
`content-entry.js` from the extension origin. Vite emits the controller and the
shared modules separately from eight dynamic game chunks. The only exposed
extension resources are the module chunks and bundled fonts, restricted to the
listed hosts. `public/manifest.json` is the actual built manifest; HTML pages
are copied from `public/` and load their generated ES entries. `base: './'` and
disabled module preloads prevent page-origin preload requests for game chunks.

## Detection and lifetime

`idle → starting → generating → finishing → idle` is implemented in
`src/adapters/claude/stateMachine.ts`.

- A is a stop control within a matched composer area; B is a thinking or
  streaming marker in the latest matched assistant turn; C is a recent mutation
  of that turn. Any two of A/B/C assert generation. C lasts 1.2 seconds after
  the last observed mutation; mutation data and old values are never read.
- A recognized send/regenerate intent arms the observer before site event
  handlers run. An unsuccessful start times out after four seconds. A session
  already generating when the adapter first starts is also detected.
- On loss of the vote, `finishing` retains an already visible cabinet for a
  650 ms debounce. A not-yet-visible cabinet cancels its pending reveal
  immediately, so a short response cannot flash open during that debounce. A
  recovered vote cancels the debounce.
- The DOM and latest-turn observers, heartbeat timer and debounce timer are
  disconnected/cancelled on idle, stop and navigation. SPA navigation closes
  the old cabinet without re-reading stale old-route markers.
- The closed shadow host and the selected game are constructed while hidden at
  page load, without starting the loop. After the user delay, a single rAF
  mounts the host and paints the first canvas frame synchronously. Diagnostics
  records total signal-to-frame time and delay-adjusted overhead. Missing inline
  anchors fail closed; an active structural observer retries when an anchor
  appears. When an anchor is replaced, the original host is moved on the next
  frame.
- Normal inline reveal reserves an initial 80 px and expands the remainder in
  160 ms using stepped height changes; close hides the cabinet immediately and
  collapses the reserved space. Skip power-on also skips these transitions. This
  is a deliberate compromise between one-frame visibility and zero pre-reserved
  space while idle; it is not a claim of zero displacement at reveal.
- Completion freezes the game synchronously before the DOM resume/close controls
  appear. No animation loop runs while frozen. Resume continues the prior
  scene; if auto-close expires after a resumed run, it freezes again before
  closing. The post-completion UI is an explicit exception to the otherwise
  invisible idle state.

### Idle detection tradeoff

There is no general browser event for an arbitrary website changing its DOM.
Requiring **all** observers and timers to be disconnected while idle means that
an entirely programmatic generation that starts after load, without a matched
send/regenerate/submit gesture, cannot be detected reliably. Interlude chooses
that idle constraint instead of a permanent discovery observer or poll. It may
also miss a generation that begins during an SPA route replacement before a
recognized gesture. A recognized intent that does not produce a response
briefly enters `starting` and uses its bounded four-second timer; quiescent
`idle` has neither timers nor observers. If a future product decision favors
background discovery over zero idle observation, change this explicitly rather
than silently introducing an idle poll.

## Timing-only stream hook

With the opt-in enabled, `chrome.scripting` installs `public/stream-hook.js` in
the page’s MAIN world. It recognizes event streams by their response content-type
and reports only open/close state. It wraps the stream reader’s `read` and
`cancel` calls, inspects only the `done` boolean, returns the original result
untouched, and never accesses chunk values, URLs, request bodies or response
bodies. It does not feed the A/B/C vote. Other reader paths (for example
`pipeTo`) may not produce a close report; unrelated event streams can also be
reported. Those limitations cannot cause the cabinet to open. The hook is not
installed at all by default.

## Engine and input

`GameLoop` uses a 1/60 s fixed simulation step, bounded catch-up, interpolated
render alpha and hit-stop. The backing canvas is 640×360 and disables smoothing;
a full-sized canvas is displayed 1:1. Narrow screens reduce it in whole groups
of source pixels with `image-rendering: pixelated`, centered inside the
full-width panel. The Snake renderer interpolates grid positions; 2048 uses a
stepped slide timeline. `SceneStack` holds the underlying scene when paused.
Particles, shake, score pops and synthesized WebAudio are shared. High-score
writes are serialized in the service worker, including across tabs; 2048 records
the best tile as it is earned rather than waiting for game-over. The game loop
stops when the tab is hidden, and processes every other rAF when the host is
outside the viewport: both update and render run at approximately 30 Hz, with a
fixed-size step (the simulation deliberately slows while out of view). Closing
stops the loop, releases audio and disconnects visibility/resize observers.

The canvas must own focus for keyboard or gamepad input. Buttons in the panel
are virtual actions and support press/hold, pointer and touch. All games also
accept pointer gestures directly where appropriate. The global focus shortcut
never prevents a key event from a text field; Escape returns to the matched
composer. `src/shared/storage.ts` holds per-game action-to-keycode remapping
structures; there is intentionally no remapping UI yet.

## Verification

- `tests/unit/`: vote debounce, selector fallbacks, frame loop and hidden-tab
  transition, input/gamepad, storage, core rules for all eight games, a
  fake-clock zero-idle-activity test, and the adapter privacy guard.
- `tests/e2e/`: real Chromium loads `dist/`; local fixture pages are fulfilled
  under the real Claude origin. CDP pierces the *closed* root only in tests.
  Tests cover the idle state, first-frame budget, short replies, exact
  placement, focus, pause/resume, remount, placements, drag persistence,
  auto-close, selector editor, timing hook, all game chunks, game-over restart,
  low-rate offscreen rendering, route changes, and pixel scaling.
- The privacy guard is a conservative syntax check over adapter source; it
  rejects content-access APIs, including computed and destructured forms.
  It cannot prove that arbitrary future code is private. Review remains required.
- Headless Playwright keeps its pages logically visible even when another tab is
  brought to front. The hidden-tab engine transition is unit-tested; verify
  real tab switching in a normal Chrome profile.
