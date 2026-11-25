# Contributing

Read [design rules](design/DESIGN.md), [architecture](docs/ARCHITECTURE.md),
[adapter guidance](docs/ADAPTERS.md), [privacy](docs/PRIVACY.md), and the
[code of conduct](CODE_OF_CONDUCT.md) before proposing changes. Keep the amber
CRT identity, square geometry and focus-gated controls. New behavior needs a
sensible, nonpunitive default and a schema description/reset when configurable.

## Local checks

Use Node 20.19+ and Chromium:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --audit-level=low
```

Build before Playwright: tests load the real `dist/` extension and route site
origins to **synthetic** fixtures. Never commit an actual transcript, account
identifier, cookie, private key or screenshot containing a real conversation.
Exercise keyboard/focus, visibility, idle teardown, settings changes and failure
paths. Keep commits small and explain any performance or permission tradeoff.

New site selectors require explicit host permission review, fixtures, fail-closed
mount behavior, diagnostics and the built privacy audit. Do not weaken the
privacy checks to make a test pass. Signing and deployment must follow
[docs/SECURITY.md](docs/SECURITY.md); never include a private key in a PR.

For release, keep package and manifest versions in sync, run all checks, create a
matching `vX.Y.Z` tag and push it to the authorized GitHub repository. The
workflow publishes two zips and a SHA-256 file only after validation. Update the
static release manifest separately after publication.
