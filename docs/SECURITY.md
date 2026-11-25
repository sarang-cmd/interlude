# Security and signed selectors

Report vulnerabilities privately through the repository's GitHub security
advisory feature if available, or contact a maintainer privately. Do not publish
credentials, real transcripts, private selectors containing chat text or an
unredacted diagnostic report in a public issue. See also the root
[security policy](../SECURITY.md) and [privacy](PRIVACY.md).

## Trust boundary and current key

Selector updates are **off by default**. The initial workspace generated a local
**staging** Ed25519 private key at `private-keys/selector-signing.pem` (not
included in a fresh clone) and bundled the corresponding public key in
`src/updates/publicKey.ts`. The private key is
ignored by Git and is not part of the extension, source archive, CI artifacts or
`deployment/`. Treat it as sensitive; transfer it to controlled storage if you
need to reproduce the staging signature. **Rotate it and establish an offline
production signing process before using remote updates for a public release.**
Do not paste the key into chat, commit it, upload it to Vercel, or put it into
CI logs. Only authorized maintainers should sign reviewed selector changes.

`deployment/selectors/v1.json` is signed by the staging key and is served by
the separate project at `https://interlude-sepia.vercel.app`. It is **not a
production trust root**; selector updates remain off by default. The previously
configured `interlude.vercel.app` serves another application and was not
changed. The static routes use `Access-Control-Allow-Origin: *` (see
`deployment/vercel.json`). Confirm both endpoints return JSON and the CORS
header from a fresh extension installation after any deployment.

## Local game worker boundary

The Tic-Tac-Toe search worker and its host are packaged with the extension. The
host page accepts only a single `MessagePort` from its immediate supported chat
origin (or an extension-owned options preview), and accepts only a bounded
three-in-a-row task. It exposes no generic script execution, browser storage or
network transport. Returned moves are checked against the current board, and
cancelled or stale replies are ignored. A malicious supported page may interfere
with the short-lived host frame, so a failed search uses a basic legal fallback;
this is not a security boundary against a fully compromised browser. The built
privacy audit restricts worker construction, frame source and web-accessible
resources to the packaged host and search asset.

## Signing and rotation

1. On an offline or appropriately secured machine run
   `npx tsx scripts/generate-selector-key.ts /secure/path/private.pem`. The tool
   refuses to overwrite an existing key and prints the raw public key only.
2. Replace `SELECTOR_PUBLIC_KEY` with the printed value, commit **only the public
   key**, rebuild and release the extension. Older installations trust the old
   key; plan rotation and recovery accordingly. Back up the private key offline.
3. Edit `deployment/selector-payload.json`: set a strictly increasing UTC
   `issuedAt` in ISO format and review all three sites' ordered CSS groups. Never
   include conversation content. Test the candidates in synthetic fixtures and
   real profiles before signing.
4. Run `npm run sign:selectors -- deployment/selector-payload.json /secure/path/private.pem deployment/selectors/v1.json`.
   The signer validates the schema and refuses a key that does not match the
   bundled public key. Have a second maintainer review the file and signature.
5. When rotating the key, re-sign the payloads contained in
   `test/fixtures/selectors/previous.json` and `custom.json` as well as the
   deployment example, then run unit, Playwright and build/privacy checks.
   Extract each fixture's `payload` into a temporary JSON input before signing;
   never include the temporary private key or signing material in the output.
6. Publish the reviewed signed JSON to the owner-controlled static route. The
   release manifest `deployment/updates/latest.json` must be updated separately
   after a real GitHub release; it accepts only the official matching
   `interlude-vX.Y.Z.zip` download URL. There is no automatic installation.

The signed envelope has exactly `{ "payload": ..., "signature": "base64" }`.
The signature is Ed25519 over UTF-8 canonical JSON: object keys recursively
sorted, array order preserved, no extra whitespace. The payload has exactly
`version: 1`, an ISO `issuedAt`, and all expected site/group arrays. Arrays,
strings and total response size are bounded. Malformed schema, invalid
signatures, dates more than 24 hours in the future and older-than-last-good
payloads are rejected. CSS query errors fail closed in the resolver. Each cached
file is verified again before a content script uses it; local selector-bench
overrides take precedence. Replaying an equally dated valid signed file is not
prevented: use a strictly increasing timestamp and protect the signing key.
If the browser lacks Ed25519 verification, remote data is ignored.
