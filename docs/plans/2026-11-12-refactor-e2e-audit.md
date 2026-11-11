# E2E audit for refactor phase 3 (2026-11-12)

Each E2E test with the unit or browser test that already covers it. Check each mapping before deleting the E2E test. Delete this file together with the refactor plan.

Classes: **K** keep in E2E, **B** already covered (delete), **C** move to a unit or browser test, **D** merge into another E2E test.

## article.spec.ts → none
| Test | Class | Covered by / note |
|---|---|---|
| hover shows the card with the Japanese translation | B | `lookup-ui` "hover card › appears 250 ms after…", "shows the base form…" |
| only the article gets highlights | B | `article-scope.browser` (both tests) |
| a dictionary phrase is one new term | B | `lookup-ui` "dictionary phrases › highlights a detected phrase…" |
| a phrase with only an English definition | B | `lookup-ui` "shows a phrase's English definition as English…" |
| a word saved from the panel keeps Learning | D | → the one persistence test (content.spec) |
| a selected phrase is saved and highlighted | B | `phrase-ui` "saves the selected words as a phrase…" |
| a selection shows its pattern | B | `phrase-ui` "shows the pattern's card…", "saves… under the pattern"; `handlers.test` matchSelection |
| the end marks unsaved words Known / keeps them New | B | `unsaved-at-end.browser` (both); the second used `waitForTimeout` |
| Seen elsewhere lists the other article | B | `lookup-ui` "lists where a saved word was seen on other pages" |
| a Spanish article | B | `classify.smoke` / `packs.smoke`; also the errors spec's Spanish flow |
| Spanish as native: Spanish meanings | B | `packs.smoke` "generated en-es dictionary"; `DictionaryWindow` translation-table hint. Add the `tangy→acidulado` assertion to packs.smoke (C) |
| popup asks the page for Mark all | B/D | `unsaved-at-end` "the popup's Mark all…"; popup.spec |
| on-page UI follows the theme | C | `ThemeScope.browser` with an `emulateMedia` command |

## content.spec.ts → 1 test
| Test | Class | Note |
|---|---|---|
| runs on an English page, no card | D | injection shown by every article test; `lookup-ui` "has no Lingo card" |
| not on a Japanese page / Spanish page while learning English | B | `article.browser` "does nothing on a page in another language"; `should-run.test` |
| New on → new words highlighted | B | `article.browser` "analyzes the page's blocks…"; `classify.smoke` |
| a saved word gets Learning | **K** | the single persistence test: save from the panel → Learning on every form (loaves/loaf) → reload → still Learning |
| nothing on a neverRunOn host | B | `article.browser` "does nothing on a host in neverRunOn"; `should-run.test` |

## extension-errors.spec.ts → keep (12 tests)
Keep everything: it is the Errors-page check. Merge the check-build Spanish article into the check-build "articles" flow. Its `highlighted`, `pointOn`, `openArticle`, `showNewWords` helpers and the `port`/`cdp`/`errors` fixture (also in pack-downloads) become shared helpers.

## history.spec.ts → none
B: `article.browser` "sends the sentences of analyzed blocks…", "follows the sentence-history switch…"; `lookup-ui` "lists sentences kept from another page for an unsaved word"; `history-import.browser`; `WordList.browser` details; `SettingsPage.browser` "sentence history ›".

## isolation.spec.ts → 2 tests
| Test | Class | Note |
|---|---|---|
| page styles do not leak in + the extension does not leak CSS out | K (one test) | real `createShadowRootUi` host, `cssInjectionMode: "manual"` |
| a page script's clicks do not reach the article UI | C | make the article test helper's `mountUi` call `guardShadowRoot` like the entrypoint; add a `.click()` case to `lookup-ui` "events a page script makes" |
| production: article UI and video UI unreachable | K (one test) | closed roots only exist in production |

## messaging.spec.ts → 0 or 1
The cold/warm/restart timings overlap the errors spec's "a service worker stopped mid-session". Fold them in or keep this one test.

## netflix.spec.ts and youtube.spec.ts → one smoke test each
Keep the first test of each, trimmed to: the MAIN-world hook → content script → background → subtitle with highlights and its Japanese line, and no CSP violation (YouTube's Trusted Types). Everything else is B:
- Netflix: `netflix-mount.browser` (control bar, lift, fullscreen), `netflix.browser` (subtitles hidden/shown, panel geometry, URL change, manifest wait), `netflix-page.browser` (seek), `VideoPanel` / `session.browser` (seek on card, Words tab, end of video, next video)
- YouTube: `mount.browser` (position, translation, fullscreen ×7, dictionary window placement, press outside), `LingoMenu` (sliders, switches), `SubtitleOverlay`, `VideoPanel`, `WordsList`, `session.browser` (hover, click, Known by frequency, save, off/on, end of video, fullscreen ×3). The "does not pause" check is a one-line C into `mount`
- YouTube comments ("one dictionary at a time"): C. Extract the wiring from `entrypoints/youtube.content.ts` into a module and test it with the YouTube test page and `testBackground`

## pack-downloads.spec.ts → 1 test
One flow: broken mirror → "Couldn't download" + Retry → mirror fixed → Retry in Settings → the page is highlighted. Replace `waitForTimeout(1_000)` with a wait on the `packsUnavailable` reply.

## popup.spec.ts → 2 tests
| Test | Class | Note |
|---|---|---|
| header shows app and pair | B | `Popup.browser` |
| gear opens options + (wordlist.spec) popup opens word list | D | one test: "the header icons open the extension pages" |
| unsaved words, Mark all, Undo | **K** | popup ↔ content script ↔ background |
| On this site off/on | D | append to the test above |

## settings.spec.ts → 1 test
| Test | Class | Note |
|---|---|---|
| changes reach an open page at once | K (trimmed to one switch) | slider and article switch covered by `article.browser` and `SettingsPage.browser` |
| backup export → import in another browser | B | `term-store.browser`, `SettingsPage.browser`; the real download/file input is in the errors spec |
| dark mode until a theme is picked | C | `src/ui/page-theme.browser.test.ts` with an `emulateMedia` command |

## wordlist.spec.ts → none
B: `WordList.browser` (list, filters, search, sort, details, status, remove), `DictionaryWindow` source links; the popup → word list tab goes into popup.spec.

## Helpers
- Copied helpers: `highlighted` ×8, point-on-text ×6, `openArticle` ×4, `showNewWords` ×2, saveTerm ×2 + inline. Put them in `e2e/page.ts`
- One error-collector fixture in `fixtures.ts`
- `sendToBackground` opens a popup tab per call (~45 call sites, some inside `expect.poll`): keep one extension page open instead
- `routes.ts`: inline into `sites.ts`. Becoming dead: `knownCount`, `FakeNetflixLog.seek`. `sites.ts` `METADATA` duplicates `netflix-test-page.ts`
- Netflix control-bar idle waits (3 s each) are the largest fixed waits; most go with netflix.spec

## Unit and browser duplicates
- `handlers.test.ts` "saving brings the kept sentences in" duplicates `history-import.browser`; keep only its failure paths
- `mount` "do not reach the Words tab's filter chips" duplicates `WordsList` "a click a page script makes opens nothing"
- `mount` "the menu has no subtitle position…" restates `LingoMenu` "in fullscreen: no subtitle position"
- `netflix.browser` "has no place for the buttons while Netflix removes its control bar…" overlaps `netflix-mount` "come with a bar…" and "keep up with a bar that is built again and again"
- `article.browser.test.ts:154` defines its own `highlighted`; the test helper already exports one
