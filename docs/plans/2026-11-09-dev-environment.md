# Dev environment (tests, CI/CD, CLAUDE.md line check)

## Context
Before implementing phase 1 (MVP), set up the foundation for tests and CI/CD. Four requirements:
- Use Playwright to guarantee behavior across operating systems
- Write tests from the start, and never "tests that only pass" with no substance
- Run CI/CD on GitHub (https://github.com/stkhat/bottle-of-water, private)
- Keep CLAUDE.md within 150 lines, checked automatically by a hook; detailed or fast-changing information goes in separate files

Meaningful tests need something to test, so a minimal working skeleton is built as well.

## Assumptions
1. **Cross-OS**: run unit tests and E2E on Linux / macOS / Windows. E2E uses Playwright's bundled Chromium (stable Chrome 137+ no longer accepts `--load-extension`; Edge is Chromium too, so the same check covers it). Firefox is only checked for "build and `web-ext lint` pass", as in the phase-1 spec
2. **Skeleton**: WXT + Preact with only extension loading, popup, settings page and the article content script (Shadow DOM). No features such as highlighting
3. **CD**: each PR keeps Chrome / Firefox zips as artifacts; a `v*` tag attaches the zips to a GitHub Release. Store submission is manual
4. **Commits**: dev environment on the `chore/dev-env` branch with a PR. The user decides when to merge

## What to build

### 1. Tooling
- npm (Node 26 does not bundle corepack, so stay on npm), `.nvmrc` = 26, `engines` set
- WXT (`srcDir: "src"`) + Preact (`@preact/preset-vite`), TypeScript strict
- ESLint (flat config + typescript-eslint) + Prettier, **with rules that enforce the CLAUDE.md conventions mechanically**
  - `no-restricted-globals: chrome` (no direct `chrome.*`)
  - `no-restricted-properties: navigator.userAgent` (no branching on browser name)
- `.gitattributes` (`* text=auto eol=lf`) and Prettier `endOfLine: lf` (so Windows line endings do not fail CI)

### 2. Skeleton (the test subjects)
| File | Contents |
|---|---|
| `src/i18n/t.ts`, `src/i18n/locales/en.json` | `t("key", vars)`. Keys are typed from `en.json`, so unknown keys fail type checking. Supports interpolation (`{syncName}`) |
| `src/entrypoints/background.ts` | Near-empty service worker (E2E uses it to get the extension ID) |
| `src/entrypoints/popup/` | Only the mock's header (Lingo, English → Japanese, settings gear). The gear calls `browser.runtime.openOptionsPage()` |
| `src/entrypoints/options/` | Only the settings page frame and headings |
| `src/entrypoints/content/index.tsx` | Article content script. Only when `<html lang>` is the learning language (en), inject the frame of the top-right card with WXT's `createShadowRootUi` (first step of "run only when the page language matches"; `i18n.detectLanguage` comes later) |
| `src/content/page-language.ts` | `<html lang>` check (`en`, `en-US` match; `ja` and empty do not) |

Copy and layout follow the mock (Toolbar / Article). Nothing outside the mock is added.

### 3. Tests (each confirmed to fail when the code is broken)
Three layers. All run in real browsers or Node; no fake DOM (jsdom / happy-dom).
| Layer | Tool | Subject | Browsers |
|---|---|---|---|
| Pure logic | Vitest (Node) | classification, sync packing, subtitle parsing, … | — |
| DOM parts | **Vitest Browser Mode** (Playwright inside) | Highlight API, `Intl.Segmenter`, `caretPositionFromPoint`, Shadow DOM parts, Preact screens | **Chromium and Firefox** (fake DOMs lack these APIs; Firefox's highlight underline difference shows up here) |
| Whole extension | Playwright | screens and content script with the extension loaded | Chromium (only Chromium can load extensions) |

At the skeleton stage only the content script card uses Browser Mode, but the setup is in place from the start.

**Vitest (unit)** — uses the `WxtVitest()` plugin and `fakeBrowser`
- `t()`: interpolation, handling of missing variables
- `page-language`: `en` / `en-US` / `EN` / `ja` / no attribute
- `scripts/check-claude-md.mjs`: 150 lines pass, 151 fail, CRLF counts the same, paths other than CLAUDE.md are ignored
- `tests/manifest.test.ts` (after build): Chrome `permissions` / `host_permissions` / content script `matches` exactly equal the expected values (more permissions mean more install warnings, so adding one means editing the test on purpose). The Firefox manifest has `browser_specific_settings.gecko.id` (without it `storage.sync` does not work)

**Playwright (E2E)** — `e2e/fixtures.ts` loads the extension with `launchPersistentContext` and takes the extension ID from the service worker URL. Test pages are served by a tiny static server written with Node's `http` (`e2e/serve.mjs`, OS-independent) started via `webServer`
- Popup: the header copy comes from `en.json`; the gear opens the settings page in a new tab
- Article content script: the Shadow DOM card appears on a `lang="en"` page and nothing appears on `lang="ja"`
- Style isolation: on a page with `* { color: red !important; font-size: 40px !important }` the card looks unchanged, and the extension's CSS does not leak into the page
- No `waitForTimeout`; wait for elements and events

**Mutation testing** (checks that tests really check something)
- Stryker (vitest runner) on `src/**/*.ts` (excluding entrypoints). Weekly and manual workflow. Report only at first; thresholds later
- No coverage percentage targets (they breed tests written for the number)

### 4. Claude Code hook and the CLAUDE.md line check
- `scripts/check-claude-md.mjs` (Node, so it runs on Windows)
  - No arguments: count every `CLAUDE.md` in the repo; exit 1 if any exceeds 150 lines (for CI and `npm run check`)
  - `--hook`: only when `tool_input.file_path` in the JSON from Claude Code (stdin) is a CLAUDE.md, count it; if over, exit 2 with the reason on stderr (sent back to Claude)
- Register it in `.claude/settings.json` (shared, committed) as `PostToolUse` (matcher: `Edit|Write|MultiEdit`). Leave `settings.local.json` alone

### 5. CLAUDE.md and separate files
CLAUDE.md keeps only stable rules and where to read (aim for 60–80 lines).
- Keep: overview, read first, constraints, dev commands (`npm run dev` / `check` / `test` / `test:e2e` / `build`), key test and commit rules, working style
- Move out
  - `docs/status.md`: current status, next steps, open items (updated as work moves)
  - `docs/testing.md`: test policy (verify behavior through public interfaces / see it fail before implementing / mock only browser APIs and network boundaries / no full-screen snapshots / E2E selects by role and text / YouTube and Netflix subtitles via fixtures / compare UI with the mock before committing) and where tests live
  - `docs/development.md`: tooling, CI/CD flow, release steps, checking the Firefox build, how E2E works (why stable Chrome cannot be used, etc.)

### 6. GitHub Actions
- `.github/workflows/ci.yml` (push to main / pull_request; cancel older runs on the same branch)
  - `check` (ubuntu): CLAUDE.md lines, ESLint, Prettier, `tsc --noEmit`
  - `test` (matrix: ubuntu / macos / windows): `npm ci` → `playwright install --with-deps chromium firefox` → unit tests (Node) → Browser Mode (Chromium, Firefox) → Chrome and Firefox builds → manifest test → E2E. On failure keep the Playwright report and traces as artifacts
  - `package` (ubuntu, after `test`): `wxt zip` (Chrome / Firefox), `web-ext lint`, keep the zips as artifacts
- `.github/workflows/release.yml` (`v*` tags): check that the tag equals `package.json` version → build zips → attach them with `gh release create`. `workflow_dispatch` builds the zips without a Release (for testing)
- `.github/workflows/mutation.yml`: weekly + manual. Keep the Stryker report as an artifact
- `.github/dependabot.yml`: npm and GitHub Actions weekly
- Use the latest major versions of actions at implementation time

### 7. git
1. Build the above on `chore/dev-env`, each test seen failing first and then passing
2. Push, open a PR, and confirm CI passes on all three OSes. Fix failures
3. Branch protection (required checks) needs a paid GitHub plan for private repos. Check whether it is possible and ask the user before setting it

## Verification
- Local (macOS): `npm run check`, `npm test`, `npm run build` (Chrome / Firefox) and `npm run test:e2e` all pass
- Break things and confirm the tests fail (each time, with results reported)
  - Remove the `lang` check from the content script → the `lang="ja"` E2E fails
  - Inject into the DOM directly instead of Shadow DOM → the style isolation E2E fails
  - Add a permission to the manifest → the manifest test fails
  - Write `chrome.runtime` directly → ESLint fails
  - Make CLAUDE.md 151 lines → the hook pushes back and `npm run check` fails
- GitHub: `check` / `test` (3 OSes) / `package` are green on the PR; zips are kept as artifacts. Running `release.yml` via `workflow_dispatch` produces zips (a real tagged Release only after asking the user)
- Afterwards update `docs/status.md`
