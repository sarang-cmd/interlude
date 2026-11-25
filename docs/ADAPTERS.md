# Site adapters

## Contract and discovery

Each adapter is a `SiteAdapter` (`src/adapters/types.ts`): `id`, `displayName`,
`matches(url)`, a generating observable with reasons, a mount-point resolver,
host theme, diagnostics, explicit start/stop/navigation, and the small
lifecycle hooks the panel needs for focus, structural invalidation and metrics.
An adapter owns and cleans up every observer and timer it creates. It must not
read, log, retain or transmit conversation contents.

`src/content/main.ts` uses Vite’s eager `import.meta.glob` to discover default
`SitePlugin` exports in `src/adapters/*/index.ts`. A plugin supplies `id`,
`implemented`, `matches`, `create`, and optionally a selector override storage
key. Add a new site’s adapter and plugin in **one `index.ts` file**; no central
TypeScript registry needs editing. The browser manifest still needs the new
host permission and content-script match pattern. The web-navigation filter is
derived from the manifest’s host permissions.

Start with `src/adapters/claude/index.ts` and `adapter.ts`, or replace the
intentionally inactive `chatgpt/index.ts` or `gemini/index.ts`. The unimplemented
plugins have `implemented: false` and do not mount anything. An implemented
adapter should use ordered selectors and expose which fallback matched. Do not
identify an assistant turn by reading a hidden heading or message content; use
role/test attributes and other structural markers instead. A false negative is
preferable to placing an overlay on top of a response.

For a new site:

1. Implement the plugin and `SiteAdapter`. Confine site selectors to that
   adapter’s data file; Claude uses `claude/selectors.json` so operators can
   repair it without a rebuild. Subscribe to relevant submit/regenerate intent,
   find the latest assistant element, and disconnect observers and timers on
   idle, navigation and `stop()`.
2. Return an anchor and one of `after`, `before`, `inside-end`,
   `fixed-overlay`, or `fixed-side`; inline should be directly below the site’s
   indicator and must not cover the response. Notify the controller of active
   structural changes so it can re-anchor in one frame. Exclude the Interlude
   host from the heartbeat.
3. Add the host to `host_permissions`, `content_scripts.matches` and
   `web_accessible_resources.matches` in `public/manifest.json`. Keep the
   resources limited to extension modules and bundled fonts.
4. Add idle, thinking, streaming, finished, regeneration and mount-replacement
   fixtures. Run `npm run build`, `npm test` and `npm run test:e2e`. Never use
   real chat transcripts as fixtures.

## Claude selector bench

1. Install/reload the unpacked extension and open a Claude conversation.
2. Open Interlude → **Diagnostics**. Choose the Claude tab. Generate a response
   long enough to inspect it. A and B should assert; C reflects only recent
   assistant-node mutation timing. D is optional and does not vote.
3. In browser DevTools inspect only element **structure and attributes**. Find
   the composer, stop control, latest assistant turn and the indicator. Never
   paste message text into a selector. Compare with the candidate number shown
   for each element.
4. Edit the JSON in **Selector bench**. Put a stable test-id or role selector
   first, followed by realistic fallbacks. Apply; the running adapter reloads
   its local overrides immediately. Restore defaults at any time. Invalid CSS,
   unknown keys and empty candidate arrays are rejected.
5. Confirm the inline anchor and signal-to-frame overhead. Reload the Claude
   tab and repeat with a regenerate, an edit, a branch switch, a short response
   and a long response. Verify other placements and keyboard focus.

Claude selectors are best-effort candidates, not a claim of verified current
DOM. The `inactiveTurnAncestor` selector group excludes hidden/inactive branch
ancestors before selecting the latest assistant turn; adjust it if a live site
uses different branch visibility markup. In particular, a fallback matching `data-is-streaming="true"` on the
assistant message itself anchors after that entire element if no separate
indicator is found; it remains in flow and cannot cover the answer, but it is
not equivalent to a verified separate thinking-indicator anchor. Reports of
`chat-input-send`, `chat-input-stop`, and assistant message markers in public
third-party projects informed candidates, but no authenticated live session was
available for this build.

## Fixture and privacy rules

The local fixture HTML is synthetic. `tests/e2e/extension.spec.ts` starts the
actual built extension and routes the Claude origin to those files. The static
privacy check (`npm run check:privacy`, also part of `npm run build`) rejects
adapter references to DOM content access APIs, old mutation values, and unsafe
`.data` access. It is deliberately stricter than necessary for structural
checks and can have false positives; do not bypass it to read contents.
