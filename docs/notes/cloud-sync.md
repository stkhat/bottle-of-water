# Cloud sync: spike results (C0)

The milestone C0 of [plans/cloud-sync.md](../plans/cloud-sync.md): a throwaway extension (not in the repo) that signs in to Google and reads and writes one gzipped file in Drive's `appDataFolder`, run in the user's Chrome on 2026-11-21. The design it checks: [architecture](../specs/architecture.md) "Sync to the user's own cloud storage".

## Google Cloud project
- One project registered by the user with their own account: Drive API on, consent screen External in Testing (the user as test user), scope `https://www.googleapis.com/auth/drive.appdata` only
- Two OAuth clients in it: a **Chrome extension** client (for `identity.getAuthToken`, tied to an extension ID) and a **Web application** client (for `identity.launchWebAuthFlow`, redirect `https://<extension id>.chromiumapp.org/`; Firefox's `https://<hash>.extensions.allizom.org/` is added when Firefox is checked)
- Client ids are not secrets (they go into the manifest); no client secret is used

## Results (Chrome 157, macOS)
| Check | Result |
|---|---|
| `getAuthToken({interactive: true})` with `drive.appdata` | works; the token's granted scopes are `drive.appdata` only |
| `getAuthToken({interactive: false})` afterwards | works without a window |
| Write (multipart upload with `parents: ["appDataFolder"]`, `appProperties`), list (`spaces=appDataFolder`), read (`alt=media`), delete | all work |
| Host permissions | none needed: `www.googleapis.com` answers extension pages' cross-origin `fetch` (CORS) with only the `identity` permission |
| The Web client through `launchWebAuthFlow` (implicit flow, `response_type=token`) | works interactively; the token lasts 3,599 s |
| Both clients see the same `appDataFolder` | yes: the Web client listed and deleted the file the Chrome-extension client wrote |
| `launchWebAuthFlow` without a window (`prompt=none`) right after the interactive sign-in | **fails** with `interaction_required` (164 ms) |

- So in Chromium the auth half uses `getAuthToken` (it renews itself); `launchWebAuthFlow` is only for browsers without it. Its silent renewal failing is the open question for Firefox (below)

## Extension ids
- A "Chrome extension" client is tied to one extension id. The store item's id is known only once the item exists; an unpacked build without a manifest `key` gets an id from its folder path
- Decision: development and check builds carry a fixed manifest `key` (the spike's public key, id `dgabnakfehpeammboohlkafhhdegbffe`, already registered as the Chrome-extension client); production builds carry none, and the store item's id gets a Chrome-extension client of its own in the same project before publishing (same project, so the same `appDataFolder`: data written by a check build is the same data). Both client ids are in the build configuration per mode

## Sizes on the user's data
- The user's last JSON export (2026-11-18): 337 terms, no occurrences or meanings; `main` would be 5.9 KB gzipped, about 18 bytes per term, so 10,000 terms ≈ 175 KB. Occurrences were not in that export, so month-file sizes stay the architecture's estimate until C7 measures them

## Not checked yet
- Firefox (not installed on the user's Mac; the Chrome version ships first): `launchWebAuthFlow` there, its silent renewal (try `login_hint` with the account's address and `prompt=none`; Chrome's failure above may come from several Google accounts in the browser), and whether Firefox takes `identity` as an optional permission. Done before the Firefox version
- What publishing needs: whether `drive.appdata` is listed as non-sensitive in the project's Data access page (then only brand verification) and the unverified-app screen users see while the project is in Testing
- Mobile client types (iOS / Android) in the same project: checked with the mobile app
