# Cloud sync: spike results (C0) and the real check (C7)

The milestone C0 of the cloud sync build (C0–C7, done 2026-11-21): a throwaway extension (not in the repo) that signs in to Google and reads and writes one gzipped file in Drive's `appDataFolder`, run in the user's Chrome on 2026-11-21. The design it checks: [architecture](../specs/architecture.md) "Sync to the user's own cloud storage".

## Google Cloud project
- One project registered by the user with their own account: Drive API on, consent screen External in Testing (the user as test user), scope `https://www.googleapis.com/auth/drive.appdata` only
- Two OAuth clients in it: a **Chrome extension** client (for `identity.getAuthToken`, tied to an extension ID; unused since 2026-11-21, "Account choice" below) and a **Web application** client (for `identity.launchWebAuthFlow`, redirect `https://<extension id>.chromiumapp.org/`; Firefox's `https://<hash>.extensions.allizom.org/` is added when Firefox is checked)
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

- So at first in Chromium the auth half used `getAuthToken` (it renews itself), `launchWebAuthFlow` only for browsers without it. Replaced the same day by `launchWebAuthFlow` everywhere ("Account choice" below)

## Account choice (2026-11-21, Chrome 157, same extension id and Web client)
- Found by the user: after Disconnect, Connect signed straight back into the same account, with no way to choose another. `getAuthToken` always uses the Chrome profile's own signed-in Google account, so two Chrome profiles signed in with different accounts save to different Drives and never sync

| Check | Result |
|---|---|
| `getAuthToken({interactive: true})` | a token for the Chrome profile's account, no chooser |
| `launchWebAuthFlow` interactive with `prompt=select_account` | Google's account chooser; the user picked another account, and `drive/v3/about?fields=user(emailAddress)` returned that one |
| `launchWebAuthFlow` non-interactive, `prompt=none`, no `login_hint` | fails `interaction_required` (145 ms) |
| `launchWebAuthFlow` non-interactive, `prompt=none&login_hint=<that address>` | works in 360 ms: a token for the same account, `expires_in` 3599 |

- Decision: `launchWebAuthFlow` in every browser, Chrome included; Connect and Reconnect pass `prompt=select_account`, the silent renewal `prompt=none` with the connected account's address as `login_hint` ([architecture](../specs/architecture.md) "Google Drive" → "Auth"). The manifest `oauth2` block and the Chrome-extension client id are gone from the build; the manifest `key` stays, since the Web client's redirect URI names the id
- The earlier `interaction_required` (above) was the missing `login_hint`, as guessed: with it the silent renewal works in Chrome

## Extension ids
- A "Chrome extension" client is tied to one extension id. The store item's id is known only once the item exists; an unpacked build without a manifest `key` gets an id from its folder path
- Decision: development and check builds carry a fixed manifest `key` (the spike's public key, id `dgabnakfehpeammboohlkafhhdegbffe`, already registered as the Chrome-extension client and in the Web client's redirect URIs); production builds carry none, and the store item's redirect URI is added to the Web client before publishing (same project, so the same `appDataFolder`: data written by a check build is the same data). Since "Account choice" only the Web client id is in the build configuration per mode

## Sizes on the user's data
- The user's last JSON export (2026-11-18): 337 terms, no occurrences or meanings; `main` would be 5.9 KB gzipped, about 18 bytes per term, so 10,000 terms ≈ 175 KB. Occurrences were not in that export, so month-file sizes stay the architecture's estimate until C7 measures them

## Real check in the user's Chrome (C7, 2026-11-21)
Check build of `ad8349e` plus the declined sign-in fix, two Chrome profiles (each signed in to Chrome with a different Google account), both connected to the same Google account through the account chooser, an English Wikipedia article (Honey bee).
- Connect: Google's chooser, then the consent screen; Settings showed "Google Drive (<address>)" and 2 devices. The first try, before the chooser existed, connected each profile to its own Chrome account: nothing synced, which is how "Account choice" (above) was found
- Profile 2 → profile 1: a term saved as Learning, a meaning chosen with "Use here" and its sentence all arrived (dictionary window: Learning, "Used here", "1 sentence")
- Profile 1 → profile 2: a status change (Learning → Known) and a new Learning term arrived between 2.5 and 4.5 minutes later, within the 5-minute check
- Disconnect, then Connect: the chooser again, another account could be picked
- Reconnect needed: the user removed Langle's access in their Google account; the popup then showed "Reconnect needed", and Reconnect (chooser, consent) brought back "Last saved to Google Drive …"
- Consent screen in Testing: accounts not listed as test users get Google's "Access blocked … has not completed the Google verification process" (Error 403 `access_denied`); test users saw no unverified-app warning
- Error log: only the two declined sign-ins (the 403 above) were logged as errors; since then a closed or declined sign-in window changes nothing and logs nothing. Read and cleared in both profiles
- Not checked: sentence history across devices (browser tests cover it), storage full, a newer file version, month-file sizes on real data

## Not checked yet
- Firefox (not installed on the user's Mac; the Chrome version ships first): `launchWebAuthFlow` there, its silent renewal (`login_hint` with the account's address and `prompt=none`, which works in Chrome), and whether Firefox takes `identity` as an optional permission. Done before the Firefox version
- What publishing needs: whether `drive.appdata` is listed as non-sensitive in the project's Data access page (then only brand verification) when the consent screen goes to In production. In Testing only test users can sign in (above)
- Mobile client types (iOS / Android) in the same project: checked with the mobile app
