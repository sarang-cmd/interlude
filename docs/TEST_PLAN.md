# Human verification

The automated tests use synthetic pages and a real Chromium extension process;
they do **not** establish that Claude’s current authenticated DOM matches the
selector candidates. No live chat or human game-feel study was available during
development. Use disposable test prompts, and do not copy conversation content
into diagnostics or issue reports.

## Install and signal

1. Unzip the supplied extension archive. In Chrome, open `chrome://extensions`,
   enable Developer mode, and choose **Load unpacked** on the extracted folder
   containing `manifest.json`. Alternatively run `npm ci && npm run build` and
   load `dist/`. Reload an existing Claude tab after installation.
2. Open an authenticated Claude conversation. While idle, verify that nothing
   from Interlude is visible and that the page’s normal controls work. In the
   toolbar popup, open Diagnostics and select the Claude tab.
3. Send a prompt that takes several seconds. With the default 500 ms delay,
   verify that the game appears directly below the current thinking/streaming
   indicator, in the conversation flow, without covering the answer. Diagnostic
   votes A and B should reflect the real stop control and indicator; C should
   reflect recent structural mutations. Check the matched selector candidates
   and the delay-adjusted signal-to-frame number (target **under 80 ms**).
4. Send a response that finishes in under 500 ms. Verify there is no flash or
   stub. If Claude changed its markup, repair the ordered candidates in the
   Selector bench using **attributes and structure only**, then repeat. If no
   recognized indicator exists, inline mode stays hidden rather than covering
   the answer. The streaming-attribute fallback can anchor after the entire
   assistant message when there is no separate indicator.
5. Test a regenerate, edit and resubmit, a branch switch, back/forward, and
   switching to another chat. Check for a single cabinet, no orphaned controls,
   no false completion on navigation, and no lingering observer/timer activity
   once the cabinet is closed and the adapter is idle. An entirely programmatic
   start with no recognized gesture may be missed by the zero-idle-observer
   design; see [ARCHITECTURE.md](ARCHITECTURE.md#idle-detection-tradeoff).

## Controls, finish and placements

6. The cabinet must wait at READY. Click it or use Alt+G; test arrows/Space,
   Escape, a composer click, and typing in the composer while the game is open.
   The extension must never cancel composer or text-field keys. Test on-screen
   buttons and swipes on a touch device, and a standard gamepad while the game
   has focus.
7. Let a reply finish during play. Confirm the run freezes, **CLAUDE IS DONE**
   and RESUME/CLOSE appear, RESUME continues the same run, and CLOSE returns
   focus. Enable auto-close and verify its default 10-second grace. Test P for
   a manual pause and resume, including holding P without repeated toggling.
8. Try docked-composer, side and overlay placement; drag the overlay and reload
   the page to confirm its position persists. Change games while paused, and
   check the one-time power-on flicker and the skip-power-on setting.
9. Switch to another browser tab during a run, then return; the simulation should
   stop while hidden. Scroll the panel out of view and back to verify the
   reduced-rate behavior and recovery in the normal Chrome profile.

## Game feel and records

10. Play each of the eight cabinets for several runs. Check keyboard, pointer
    and touch, rapid retry, visual legibility at full and narrow widths, and
    audio/mute. Specifically test Snake queued turns, Breakout launch and
    power-ups, Flapper gaps, 2048 slide/undo/best tile and clock, Pong’s three AI
    levels, Blockfall rotate/hold/ghost/drop/line clear, Rockfall inertia/fire/
    shields and Dashline short versus held jumps. Assess the requested 20–90 s
    typical run length with real players; deterministic simulation tests are not
    evidence of human difficulty or timing.
11. Set a personal best, close and reopen/reload, and check persistence. 2048’s
    best tile is recorded when earned, including if the cabinet closes before
    game-over. The default 2048 clock is 90 seconds; Settings can adjust it or
    turn it off with zero.
12. Optional: enable stream timing, verify Diagnostics reports open/close on a
    real streamed response, then disable it. It is off by default, observes
    timing only, and is not a vote. Not every stream consumption path is
    observable by the hook.

ChatGPT and Gemini are inactive interface-only plugins, not live integrations.
