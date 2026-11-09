# Development

## Tooling
| Tool | Version (package.json) | Use |
| --- | --- | --- |
| Node | 26 (`.nvmrc`) | runtime |
| WXT | ^0.21.5 | extension framework, build, zip |
| Preact | ^11.2.0 | UI |
| TypeScript | ^6.0.3 | types |
| Vitest (+ `@vitest/browser-playwright`, `vitest-browser-preact`) | ^5.1.0 | unit, browser and manifest tests |
| Playwright | ^1.65.0 | E2E and Vitest browser provider |
| ESLint / Prettier | ^10.14.0 / ^3.9.10 | lint / format |
| Stryker (core + vitest-runner) | ^10.1.1 | mutation report |
| web-ext | ^10.8.0 | lint the Firefox build |

## Commands
| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:firefox` | dev build with reload |
| `npm run check` | typecheck, lint, format check, CLAUDE.md line limit |
| `npm test` | unit tests |
| `npm run test:browser` | browser-mode tests (set `VITEST_BROWSERS=chromium` to skip Firefox) |
| `npm run build` / `npm run build:firefox` | build to `.output/chrome-mv3` / `.output/firefox-mv3` |
| `npm run test:manifest` | check both built manifests |
| `npm run test:e2e:build` | build, then run E2E |
| `npm run zip` / `npm run zip:firefox` | store-ready zips in `.output/` |
| `npm run test:mutation` | Stryker report in `reports/mutation/` |

## How E2E loads the extension
`e2e/fixtures.ts` launches Playwright's bundled Chromium (`channel: "chromium"`) with `--load-extension` pointing at `.output/chrome-mv3`. Stable Chrome 137+ ignores `--load-extension`, so it cannot be used. The extension id is read from the service worker URL. Pages come from a static server (`e2e/serve.mjs`).

## Checking the Firefox build
```
npm run build:firefox
npx web-ext lint -s .output/firefox-mv3
```

## CI/CD
- `ci.yml` (push to main, pull requests): `check` (typecheck, lint, format, CLAUDE.md limit); `test` on Linux, macOS and Windows (unit, browser on Chromium + Firefox, both builds, manifest, E2E; reports uploaded on failure); `package` (zips, `web-ext lint`, artifact `lingo-zips`).
- `release.yml` (tag `v*` or manual run): verifies the tag equals the `package.json` version, builds both zips, and for tags creates a GitHub release with the zips attached.
- `mutation.yml`: weekly (Monday 03:00 UTC) and manual Stryker run; uploads `reports/mutation`.
- `dependabot.yml`: weekly updates for npm and GitHub Actions.

## Release steps
1. Bump `version` in `package.json` and merge.
2. Tag `vX.Y.Z` on main and push the tag. The release workflow attaches the Chrome and Firefox zips.
3. Submit the zips to the stores by hand (store submission is manual).

## CLAUDE.md length
Every `CLAUDE.md` must stay at or under 150 lines (`npm run check:claude-md`). A Claude Code hook (`.claude/settings.json`) blocks edits that exceed it. Put details in `docs/`.
