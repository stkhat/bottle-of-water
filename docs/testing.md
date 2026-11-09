# Testing

## Policy
- Test behaviour through public interfaces, not internals.
- See a test fail before writing the code that makes it pass.
- Mock only the boundaries: browser APIs (use WXT's `fakeBrowser` for extension APIs) and the network. Nothing else.
- No fake DOM (jsdom, happy-dom). Code that touches the DOM runs in Vitest Browser Mode on real Chromium and Firefox.
- No full-page screenshot or snapshot assertions.
- E2E tests select elements by role and text, and never use `waitForTimeout`; wait for a condition instead.
- YouTube and Netflix subtitle parsing is tested with recorded fixtures.
- Before committing a UI change, render it and compare it with the mock.

## Where tests live

| Layer | Tool | Location / pattern | Command |
| --- | --- | --- | --- |
| Unit (logic, `fakeBrowser`) | Vitest, project `unit` (Node) | `src/**/*.test.ts`, `scripts/**/*.test.ts` | `npm test` |
| DOM / components | Vitest Browser Mode, project `browser` (Chromium + Firefox) | `src/**/*.browser.test.{ts,tsx}` | `npm run test:browser` |
| Built manifests | Vitest, project `manifest` | `tests/manifest.test.ts` (needs `npm run build` and `npm run build:firefox`) | `npm run test:manifest` |
| E2E with the built extension | Playwright (Chromium) | `e2e/*.spec.ts` | `npm run test:e2e:build` |
| Mutation (report only) | Stryker | `stryker.config.json`, unit project only | `npm run test:mutation` |

## Notes
- Playwright's Firefox fails to launch on the dev Mac (macOS 27). Locally run `VITEST_BROWSERS=chromium npm run test:browser`; CI covers Firefox.
- `VITEST_BROWSERS` takes a comma-separated list (`chromium`, `firefox`).
- Only Chromium can load an unpacked extension, so E2E runs on Chromium only.
- YouTube captions come from the recorded fixtures, answered like the real `/api/timedtext` (empty without a PO token) by `tests/youtube-timedtext.ts`: a Vite middleware in browser tests, `context.route` in E2E. The fake player API (`e2e/fake-youtube-player.ts`) and the 4-second clip (`e2e/fixtures/video.webm`) are shared by both. The YouTube E2E uses a 140-second clip (`e2e/fixtures/talk.webm`, VP8, 160×90, black) so it can seek to the recorded captions (they run to 2:15); `context.route` answers its byte ranges, without which the video cannot seek.
- Netflix needs a login, so its fixtures are synthetic (`src/core/subtitles/fixtures/netflix/`: a manifest, an English DFXP track, a Japanese WebVTT track). `tests/netflix-subtitles.ts` serves the subtitle files by their URL token: a Vite middleware at `/lingo-nflx/` in browser tests (the test page points the manifest's CDN URLs there), `context.route("https://*.nflxvideo.net/**")` with CORS in E2E. The fake player (`e2e/fake-netflix-player.ts`) parses the manifest with `JSON.parse` and offers the player API; the E2E serves `e2e/fixtures/netflix-watch.html` at `https://www.netflix.com/watch/*` with the same 140-second clip.
