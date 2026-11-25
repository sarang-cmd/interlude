# Site adapters

## Contract and discovery

Each adapter implements `SiteAdapter` in `src/adapters/types.ts`: identity and
host matching, a generating observable, placement resolver, host-theme guess,
diagnostics, live selector/configuration updates and explicit lifecycle cleanup.
`src/content/main.ts` discovers `src/adapters/*/index.ts` plugins. The shipped
Claude, ChatGPT and Gemini adapters share `StructuralAdapter`, but each has its
own `selectors.json`, host, profile and fixtures. ChatGPT and Gemini are **BETA**.
None of the three has been checked against an authenticated live session for
this build.

A/B/C are stop-control, indicator and structural-mutation-timing votes; the
optional D timing hook never votes. The latest active assistant turn is chosen
across all selector candidates, with nested matches collapsed and inactive
ancestors excluded. Inline placement requires a recognized indicator and fails
closed otherwise. Overlay, side and above-composer placements use their own
safe anchors. The adapter must exclude the Interlude host from its observers and
must disconnect observers/timers on idle, navigation and stop.

## Repair a site with Diagnostics

1. Open a supported conversation and Options → **Diagnostics**. Select the site
   tab; send a disposable prompt long enough to watch A and B. Inspect the
   signal, selector fallback number, mount, state, timeline and first-frame
   measurement. Do not use or share actual conversation text.
2. In browser DevTools inspect **structure and stable attributes only**. In the
   Selector bench choose the corresponding site and order candidate arrays with
   stable test IDs/roles first. Never paste a prompt, response or account value
   into a selector. Apply; local overrides update open tabs immediately and take
   precedence over a verified remote file. Restore clears the local override and
   falls back to verified remote (if enabled) or bundled data.
3. Retest idle, long and short responses, regeneration, edit/resubmit, branch or
   turn replacement, navigation, all placements, focus and teardown. Use the
   clean report if asking for help; it intentionally contains match numbers,
   **not** literal selector text or page URLs. Review before sharing.

Selectors reported by public third-party projects informed the initial
candidates, but they are not a stable API or proof of the current live DOM.
Localization, account variants and site redesigns can change markup. A false
negative is preferable to covering a response.

## Extending

Add a plugin and ordered structural selector data, synthetic fixtures for idle,
streaming, completion, regenerate and replaced turns, and unit/Playwright
coverage. Adding another hostname requires explicit user-facing permission and
privacy review; the current built-output audit intentionally rejects hosts
outside the three listed. Do not read page text, form values, request/response
bodies, mutation old values or transcripts. Signed selector changes require the
offline review/signing process in [SECURITY.md](SECURITY.md).
