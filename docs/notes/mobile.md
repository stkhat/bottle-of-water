# Mobile (iOS / Android): direction (investigated 2026-11-12 to 11-13)

Not part of any phase yet. A record of what was considered for bringing Lingo to phones, what was chosen, and what is still unverified.

## Decided
- **Build our own browser app.** YouTube and articles open as ordinary web pages, and the extension's scripts are injected into them.
  - A general-purpose browser (any site, URL bar), so articles work too and the app is not "a YouTube wrapper" in store review.
- **Targets: YouTube (`m.youtube.com`) and web articles.** Netflix is out: DRM licenses go only to Netflix's own apps and supported browsers, and mobile browsers are sent to the app.
- Ads are not blocked (YouTube's terms; out of scope for a learning tool).

## Rejected
| Option | Why not |
|---|---|
| Safari Web Extension (iOS) | The user's decision |
| Overlay on other apps (YouTube / Netflix apps) | iOS cannot draw over other apps at all (only Picture in Picture / Live Activities, both unfit). Android can draw (`SYSTEM_ALERT_WINDOW`), but reading the captions needs OCR on screen capture or the Accessibility API: fragile, battery-heavy, risky in Play review. Netflix is black in screen captures (`FLAG_SECURE`) |
| Our app with the official embedded player (IFrame API) | Videos with embedding disabled do not play; YouTube's developer policies forbid overlays on the player; no login in a WebView; caption capture inside the cross-origin iframe is unverified; Data API search quota (10,000 units/day per project, 100 per search) is shared by all users |
| Chromium fork (Brave / Kiwi style) | Far too much maintenance |
| Chrome for Android extension | Chrome for Android still has no extensions |

## Checked: captions on the mobile site (2026-11-13)
Setup: the Claude desktop app's built-in browser (Chromium, not automated, `navigator.webdriver === false`) with a 375x812 viewport and an Android Chrome user agent, logged out. Video `iG9CE55wbtY` (same as [youtube-captions.md](youtube-captions.md)).

- The phone UA gets `m.youtube.com`. `#movie_player` has the same player API as desktop (`getPlayerResponse`, `loadModule`, `setOption`, `getOption`; caption options `reload, fontSize, track, tracklist, translationLanguages, sampleSubtitle, stickyLoading, serverDefaultTrack`). 65 caption tracks listed, including `.en`, `a.en`, `.ja`.
- `setOption("captions", "track", { languageCode: "en" })` made the player send one **XHR** to `/api/timedtext` with `potc=1&pot=…`, `fmt=json3` and client params `c=MWEB`, `cplatform`, `cmodel`, … The body was 59,007 bytes.
- Rewriting that URL and fetching it from the page, as on desktop:

| Variant | Bytes |
|---|---|
| `lang=ja` | 43,818 |
| `tlang=ja` | 50,844 |
| `kind=asr` | 379,178 |
| `lang=es` | 58,953 |
| without `pot` / `potc` | 0 (empty `200`) |

- So **the desktop capture method works unchanged on the mobile site.**
- DOM differs: present are `#movie_player`, `video.html5-main-video`, `.ytp-caption-window-container`; absent are `ytd-watch-flexy` and `.ytp-chrome-bottom` (desktop controls). Player at 375x211 under a 48 px header. A separate `PlatformAdapter` is needed for button and transcript placement.
- Not checked: real WKWebView / GeckoView / Android WebView (the token depends on the engine not being automated, so it is likely but unproven), signed-in state, Shorts, live streams.

## Not decided: Android engine
- **GeckoView**: can bundle a WebExtension (`WebExtensionController`, messaging between the extension and the app), so the existing Firefox build could run almost as is. Adds tens of MB to the app.
- **System WebView**: no extension APIs; we write the same shim as on iOS, shared between platforms.
- iOS has no choice: WebKit (`WKWebView`) is required outside the EU.

## Open issues and risks
1. **Google sign-in.** Google blocks sign-in from browsers embedded in other apps (OAuth `disallowed_useragent` since 2021-09-30; its help page says sign-in may be blocked in browsers "embedded inside another app"). Browsers built on the same engines (Brave / Firefox / DuckDuckGo on iOS, Firefox on Android) can sign in, so detection seems to rely on signals such as the user agent, not the engine. Android WebView's UA contains `; wv`. Unverified for our app and a policy gray area. Watching and captions work without sign-in; age-restricted and members-only videos need it.
2. **PO token in the real engines** (see above).
3. **Extension API shim** (WKWebView / WebView): messaging, `storage`, background work, an isolated world (`WKContentWorld` on iOS; WKUserScript can also inject into cross-origin frames).
4. **Translation.** No Chrome Translator API. Use Apple's Translation framework (iOS) and ML Kit translation (Android), on device and free, through a native bridge.
5. **Sync.** Chrome sync cannot be read from mobile, so sync to the user's own cloud (architecture: "Sync to the user's own cloud storage") becomes required.
6. **Touch UI.** Hover becomes tap; subtitles, dictionary window and buttons need a phone layout and a new mock.
7. **Distribution.**
   - App Store: be a real browser (guideline 2.5.6 WebKit; avoid 4.2 minimum functionality and 5.2.2 third-party content rejections).
   - Google Play: new personal developer accounts need a closed test with 12 testers for 14 days before production.
   - Fees: Apple Developer Program $99/year (required for TestFlight and the App Store; lapsing removes the app), Google Play $25 once.
8. **Maintenance.** When undocumented YouTube internals change, a fix waits for store review (slower than an extension update).
9. **On-device LLM (phase 3 "Ask AI" explanations).** No Chrome Prompt API (`LanguageModel`) in WKWebView, GeckoView or Android WebView, so `builtInAi` is false there. Like translation, call the platform model through the native bridge: Apple's Foundation Models framework (iOS 26+) and the ML Kit GenAI Prompt API (Gemini Nano through AICore; alpha/beta as of 2026-11). The AI part then has three providers: Chrome Prompt API, native bridge, the user's own API key.
   - Our app is in the foreground while it runs. Foundation Models' strict rate limit was reported for app extensions running in the background (a Safari extension calling through native messaging), and ML Kit allows inference only from the top foreground app, so neither is expected to bite. Unverified.
   - Device coverage is narrow: Apple Intelligence devices with it turned on (about iPhone 15 Pro and later); on Android a set of recent high-end phones, with different Nano versions per device. The API-key fallback stays required.
   - Three different models (Nano in Chrome, Apple's, Nano on Android). The measurements in the design ("Phases") were made on Chrome only; JSON output and Japanese explanations must be checked per model.

## Tooling needed for the prototype
- **iOS: full Xcode** (Xcode.app; Command Line Tools have no iOS SDK or Simulator). Builds and Simulator can be driven from the command line (`xcodebuild`, `simctl`); the IDE itself need not be used. Roughly 10+ GB plus about 8 GB for the iOS Simulator runtime (`xcodebuild -downloadPlatform iOS`). After install: `sudo xcode-select -s /Applications/Xcode.app` and `sudo xcodebuild -license accept`.
- **A free Apple ID is enough** for the Simulator and for one's own iPhone (apps expire after 7 days, 3 apps per device, no iCloud / push). The paid program is needed only for TestFlight and the App Store.
- **Android: no Android Studio needed.** Command-line tools (SDK, emulator, a system image) are enough, a few GB.

## Next steps
1. Install Xcode (the user) and the Android command-line tools.
2. Minimal browser app prototypes that inject a script, capture timedtext, and try to reach Google's password step (the user signs in; Claude never enters credentials):
   - iOS: `WKWebView`, default UA and a Safari-like UA.
   - Android: GeckoView and System WebView, to choose the engine.
3. From the results, choose the Android engine and design the extension API shim.
4. Then: phone mock, `m.youtube.com` adapter, own-cloud sync.
