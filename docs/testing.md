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
| Built manifests | Vitest, project `manifest` | `tests/manifest.test.ts` (needs `npm run build`, `npm run build:firefox` and `npm run build:check`) | `npm run test:manifest` |
| E2E with the built extension | Playwright (Chromium) | `e2e/*.spec.ts` (needs `npm run build` and `wxt build --mode check`) | `npm run test:e2e:build` |
| Mutation (report only) | Stryker | `stryker.config.json`, unit project only | `npm run test:mutation` |

## Running them
- While iterating, run only the files you touch: `npx vitest run src/path/to/file.test.ts`, `VITEST_BROWSERS=chromium npx vitest run --project browser src/path/to/file.browser.test.tsx`, `npx playwright test e2e/<spec>.ts -g "<test name>"` (after `npm run build && wxt build --mode check` when source changed).
- Before handing work back or pushing, run everything once: `npm run verify` (check, unit, browser on Chromium, builds, E2E; about 1.5 minutes, terse output).
- Open pull requests as drafts and mark them "Ready for review" just before merging: only then does GitHub run the tests (`ci.yml`, one Linux job, about 7 minutes), which adds Firefox, the one thing `verify` cannot run on the dev Mac. `cross-os.yml` (macOS and Windows) runs by hand only, e.g. before a release.
- On CI, a browser test that fails is retried once (`retry` in `vitest.config.ts`), like E2E (`retries` in `playwright.config.ts`). A test that needs its retry again and again is flaky: fix it.
- E2E tests run in parallel, files and tests alike (`fullyParallel`): every test gets its own browser profile, so a test must not depend on another.

## Notes
- Playwright's Firefox fails to launch on the dev Mac (macOS 27). Locally run `VITEST_BROWSERS=chromium npm run test:browser`; CI covers Firefox.
- `VITEST_BROWSERS` takes a comma-separated list (`chromium`, `firefox`).
- Only Chromium can load an unpacked extension, so E2E runs on Chromium only.
- Production builds put Lingo's UI on web pages in closed shadow roots (`src/content/ui/shadow-mode.ts`), so page scripts, and Playwright, cannot reach into it; the check build, development and the browser tests keep them open. E2E tests load the check build by default (`e2e/fixtures.ts`). On the production build `e2e/extension-errors.spec.ts` uses the pages through the mouse and keyboard and leaves out the steps that read or press the UI, and `e2e/isolation.spec.ts` checks that a page script finds the `lingo-*` hosts with `shadowRoot === null`. Those shadow roots also drop events a page script dispatches (`guardShadowRoot` in `src/ui/from-user.ts`), so tests of a mounted host press its controls with `userEvent` (browser tests) or Playwright's input, never `.click()` or `dispatchEvent`.
- YouTube captions come from the recorded fixtures, answered like the real `/api/timedtext` (empty without a PO token) by `tests/youtube-timedtext.ts`: a Vite middleware in browser tests, `context.route` in E2E. The fake player API (`e2e/fake-youtube-player.ts`) and the 4-second clip (`e2e/fixtures/video.webm`) are shared by both. The YouTube E2E uses a 140-second clip (`e2e/fixtures/talk.webm`, VP8, 160×90, black) so it can seek to the recorded captions (they run to 2:15); `context.route` answers its byte ranges, without which the video cannot seek.
- Netflix's fixtures are synthetic, modeled on the real structure seen on netflix.com on 2026-11-10 (real subtitles are copyrighted; `docs/notes/netflix.md`). `src/core/subtitles/fixtures/netflix/`: a manifest in the real shape (`manifest.json`) and one in the older shape (`manifest-legacy.json`), English closed captions as DFXP (one `<p>` per line) and IMSC, Japanese subtitles as IMSC (ruby styles), plus `sample.ttml` / `sample.vtt` for the parsers. `tests/netflix-subtitles.ts` serves the subtitle files by their URL token: a Vite middleware at `/lingo-nflx/` in browser tests (the test page points the manifest's CDN URLs there), `context.route("https://*.nflxvideo.net/**")` with CORS in E2E. The fake player (`e2e/fake-netflix-player.ts`) parses the manifest with `JSON.parse`, offers the player API, and plays Netflix's control bar (`controlBar`): built in the structure seen on netflix.com while the pointer moves, removed when it stops; the E2E serves `e2e/fixtures/netflix-watch.html` at `https://www.netflix.com/watch/*` with the same 140-second clip.
- `e2e/extension-errors.spec.ts` drives every flow (articles, YouTube, Netflix, popup, settings, word list, a service worker stopped mid-session, an extension reload, a nearly full `storage.sync`) on the check build, and the flows on web pages (articles, YouTube, Netflix, the extension reload) also on the production build, since the UI on web pages is what differs between them, and fails with the list of what Chrome's chrome://extensions → Errors page would show: console errors and warnings and uncaught errors from the service worker, the extension's pages and its content scripts (`e2e/error-collector.ts`; the service worker is watched over a CDP connection of its own, `--remote-debugging-port`). Its real-site tests (Wikipedia, BBC, YouTube, production build) need the network and run only with `LINGO_REAL_SITES=1` (`npm run test:e2e:real`).
- Expected conditions (no captions, a page in another language, a stopped service worker, an extension reloaded under its content scripts) must not log at warn or error level.
- The E2E extension reload (`Extensions.loadUnpacked`) is milder than Chrome's own: after `runtime.reload()` (the check build's self-reload, an update) Chrome takes `browser.storage` and other namespaces away from the old content scripts, and their teardown (`ctx.onInvalidated`) still runs. Code that runs there must not touch a `browser.*` namespace it did not keep a reference to, and a waiting page call ends as an `AbortError`, which is not logged. Unit and browser tests simulate this: `settings-store.test.ts` (no `storage`), `bridge-dispose.browser.test.ts` (aborted calls).
