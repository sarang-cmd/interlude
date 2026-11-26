# Privacy and permissions

## Exact extension permissions

| Permission                    | Reason                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                     | Sync validated settings when Chrome sync is available; keep scores, play-time statistics, selector overrides, response-time averages and pause state locally. |
| `alarms`                      | Wake the service worker for pause expiry and optional rate-limited selector/release checks.                                                                   |
| `https://claude.ai/*`         | Run the Claude content scripts and inspect structural signals in supported tabs.                                                                              |
| `https://chatgpt.com/*`       | Run the beta ChatGPT content scripts and inspect structural signals in supported tabs.                                                                        |
| `https://gemini.google.com/*` | Run the beta Gemini content scripts and inspect structural signals in supported tabs.                                                                         |

There is **no** `tabs`, `scripting`, `webNavigation`, `<all_urls>`, analytics or
advertising permission. Diagnostics can query the three permitted hosts; it uses
only the hostname and does not display tab titles or paths. The page bridge is a
declared MAIN-world content script, so no scripting permission is needed.

## Data and observation

The adapters query ordered CSS candidates and observe DOM structure and mutation
timing. They do not read or transmit chat messages, response bodies, prompts or
page titles. Host matching parses the current tab URL to compare its hostname;
page paths are not used, stored or sent. The off-by-default timing hook wraps
page-owned fetch/stream readers only when enabled: it observes an event-stream
content type and the reader's `done` flag, never request URLs, bodies or chunk
values. It is diagnostic, not a generation vote. The hook forwards the site's
requests and bytes, but wrapping page APIs can affect compatibility on unusual
sites; page traffic is not extension-origin telemetry.

Settings, including a user-specified selector URL, may be synced by Chrome to
the user's browser account via `chrome.storage.sync`; a local mirror/fallback is
used when sync is unavailable. Scores, per-day/per-game active play, streaks,
selector overrides, pause state and timing averages are in
`chrome.storage.local`. Local debug logging is off by default and limited to
structural state transitions. The JSON backup is created locally, contains
settings and local records, and is only sent elsewhere if the user chooses to
share the file. Close supported chat tabs and any open popup game before wiping
to avoid new records being written. If sync cannot be cleared, the wipe reports
that the remote copy may remain; an empty local fallback prevents old synced
settings from silently reappearing on this device. Retry the wipe when sync is available.

## Toolbar cabinet (unreleased)

Opening a game in the popup loads bundled extension resources, not the website
or a chat page. Its human scores and active-play time use the existing
`chrome.storage.local` records shared with the extension's site panels. The
popup uses global settings and listens for local pause, settings and play-time
changes to honor Focus Guard. No current game state is retained when it closes.
The popup adds no network request, analytics, host permission or account. The
separate optional metadata checks described below retain their normal schedule.

## Browser arcade

The website arcade runs the games in the visitor's browser and does not connect
or read AI chats. It loads its HTML, fonts, JavaScript and selected game modules
from the website; no application analytics or account is used. Best scores are
stored in the website origin's `localStorage`, separate from the extension's
scores and settings. If storage is unavailable, scores are kept only in memory
until the page closes. Clearing the site's browser storage removes those website
records. Visiting the website still exposes ordinary IP and HTTP/TLS metadata to
the host, as with any website.

## Local game AI

NOUGHTS AND CROSSES, DROP FOUR and FLIP DISC search run in a dedicated local worker. The website loads that
worker as a static asset from its own host. On the extension, a temporary
extension-origin frame hosts the packaged worker because a content script cannot
start an extension-origin worker directly from a chat page. The private message
channel carries only the game board and bounded search settings, not prompts,
responses, page DOM or chat text. The host is accessible only on the three
permitted sites and exposes no general storage or script-execution API. A
malicious host page can interfere with the frame; the game can fall back to a
basic local move if the worker cannot complete. The frame and worker are removed
on completion, cancellation or timeout. No additional extension permissions
or remote AI services are used.

## Extension-initiated network requests

There are exactly two automatic JSON check purposes; both are GETs, at most once
per stated interval, without request body, cookies, authorization credentials,
referrer, application-added identifiers or custom headers. Redirects are
rejected, response size is limited to 200 KB, and a check times out after eight
seconds. The server must allow cross-origin requests. A failure does not prevent
offline gameplay.

| Request                                                  | Default | Frequency                                                 | Purpose                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://interlude-sepia.vercel.app/selectors/v1.json`   | Off     | At most once per 12 hours when enabled                    | Download selector data only, verify its Ed25519 signature and strict schema, and retain the last good file. One static HTTPS URL can be configured instead; query strings, fragments, credentials and redirects are rejected. |
| `https://interlude-sepia.vercel.app/updates/latest.json` | On      | Startup/worker wake if due, and at most once per 24 hours | Compare stable versions and display a quiet notice/badge. It never downloads or installs an update.                                                                                                                           |

**No absolute anonymity is implied.** The browser/network necessarily exposes
an IP address and ordinary HTTP/TLS metadata such as the user agent and possibly
an `Origin` containing the extension ID. The extension adds no installation ID,
account ID, tracking parameter, cookie or custom header. A user-supplied URL
may itself contain identifying information in its path, so choose it carefully.
Chrome's own sync service and the AI website's own traffic are separate from
these two extension checks.

The static Vercel project serves these endpoints with cross-origin headers.
The selector file is signed by a **staging** key: leave remote selectors off
until a production key is rotated and managed offline. Network or verification
failures retain bundled or last-verified selectors. Deployment and key handling
are described in [SECURITY.md](SECURITY.md).

**Only after a user clicks**, Diagnostics can open a prefilled GitHub issue, and
the update notice can open the official GitHub release-download link. The clean
report uses an allowlist: version, browser version, adapter, boolean signals,
selector match numbers/counts, state, theme and timing. It excludes chat content,
page URL/title, account data and even the literal selector strings. Review a
report before publishing it.

## Automated checks and limits

`npm run check:privacy` rejects common DOM-content access in adapters.
`npm run check:privacy:built` inspects the built manifest, JavaScript, HTML and
CSS, disallows extra permissions/hosts and analytics markers, and checks that
only the two documented callers use the single guarded GET transport. Its
negative tests inject prohibited calls, headers, permissions, remote workers,
arbitrary frames and external assets.
These conservative static checks and synthetic browser tests are safeguards,
**not a formal proof** against every possible obfuscation or browser behavior;
review the built extension and network behavior as well.
