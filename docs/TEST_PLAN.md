# Ten-minute human checklist

Automated site checks use synthetic pages rather than signed-in Claude, ChatGPT
or Gemini sessions. Use disposable prompts. Never copy conversation text into an
issue. Times are approximate and assume the accounts are already signed in.

| Time       | Check                                                                                                                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–1:00  | Verify `SHA256SUMS.txt`, unzip and load the folder with `manifest.json` via `chrome://extensions` → Developer mode → Load unpacked. Reload existing site tabs once. Open Options → Diagnostics.                                                                                                                 |
| 1:00–3:00  | **Claude:** verify no idle stub, send a several-second prompt, check inline placement below the indicator and no answer overlap. Inspect A/B, selector fallback, mount and first-frame timing. Click/Alt+G to play, Escape to composer, finish and check freeze/resume/close. Try one regenerate or navigation. |
| 3:00–5:00  | **ChatGPT (BETA):** repeat idle → long response → completion, focus/Escape and regenerate/navigation. Confirm the cabinet never covers the answer and diagnostics identifies ChatGPT. If signals fail, document match numbers and inspect structural attributes only.                                           |
| 5:00–7:00  | **Gemini (BETA):** repeat the same signal, placement, keyboard and completion checks; verify Gemini diagnostics and a turn/navigation change. Do not assume a selector works if the panel stays hidden.                                                                                                         |
| 7:00–8:00  | Open the panel gear; change game, volume, width and placement and verify live changes. In Options search for a setting, change a site override, use changed-only and reset it. Play the preview; verify its runs do not alter scores.                                                                           |
| 8:00–9:00  | Check default auto-close/10 s grace, toolbar pause/resume, and hidden-tab pause in a normal Chrome profile. Optionally enable a 1-minute budget and lock, play until it locks, then disable it. Budgets/lockout are off by default.                                                                             |
| 9:00–10:00 | Export and re-import a backup, check local stats/score charts, and inspect the clean copied diagnostics report for accidental content before sharing. Check selector/update status and the CORS-enabled endpoints. The selector feed uses a staging key and remains off by default.                             |

If a live site's markup differs, use the local selector bench with structural
attributes only. Re-run the affected scenario and record the actual browser
version, site, signal results, fallback numbers and mount status. Keep
ChatGPT/Gemini marked beta until separately validated. Do not claim the 80 ms
first-frame budget passed unless the measured **delay-adjusted** number does.

## Extended checks (beyond ten minutes)

- Visit the browser arcade, choose each game and play with keyboard and touch.
  Check pause/resume, sound, mobile layout, offscreen freezing and that a completed
  run's website-local score survives a reload. In Pong, select the local match,
  hold W and Down together, try a remap conflict, and finish a short series.
  Check the recent local match record and the separate solo high score. For each
  other cabinet, select the split-screen race, play both sides, finish a round,
  and check the seed, handicaps, series score and browser-local record. In 2048
  co-op, alternate moves, try undo, and finish a round. Repeat with two gamepads
  and narrow touch controls.
- Play all eight games on keyboard, pointer/touch and a standard focused
  gamepad; check game-specific rules, remaps/conflicts, sounds, preview and
  records. Assess human difficulty and run length; simulation tests do not prove
  game feel.
- Exercise overlay dragging and persistence, narrow and large widths, integer
  scaling, themes, reduced motion, mute/music and the two sound packs.
- Exercise first-message, short-reply, expected-wait, tab-focus, quiet hours,
  Study Mode, local midnight, two active tabs and disabling a budget lock.
- Optionally enable the timing-only stream hook; confirm D is diagnostic only
  and does not change A/B/C votes. Some stream consumption paths are not visible.
- Verify the CORS-enabled endpoints and confirm that failures retain
  bundled/last-good selectors and never download updates automatically. Test
  production selector updates only after the staging key has been rotated offline.
