# M7 — Toolbar popup, settings page, word list page

> Executed with superpowers:subagent-driven-development. TDD; Preact screens tested in Vitest Browser Mode, the built extension with Playwright E2E. Before committing a UI change, render it and compare with the mock.

**Goal:** finish phase 1's extension pages so the PR can merge: the toolbar popup (`project/Toolbar.dc.html`), the settings page (`project/Settings.dc.html`) and the word list page (`project/WordList.dc.html`, approved 2026-11-10). Every value shown is real (settings, counts, sync status, this page's unsaved words); every control works.

## Popup (`src/entrypoints/popup/`)
- Header as built (L badge, Lingo, language pair from settings, settings gear → `openOptionsPage`)
- "On this site": the active tab's hostname. Without the `tabs` permission the popup cannot read tab URLs, so the content script reports `{ hostname }` in its `pageSummary` reply (content scripts run on every page, including sites switched off, so they can answer). If nothing answers (chrome:// pages, PDFs), the row is hidden. The switch adds/removes the hostname in `settings.disabledSites`; switching it off removes Lingo from that page immediately
- "Highlight" chips (Toolbar mock's chip style) bound to `settings.highlight`
- Counts: Learning / Known / Phrases from `counts`
- "This page": `SaveAll` (scope `page`; on video pages the content script reports scope `video`) wired to the active tab's `pageSummary` / `pageSaveAll` / `pageUndo`; hidden when the page has no Lingo session
- Sync: "Saved to {syncName} · <relative time>" (check icon) or "Not saved yet"; usage bar "Sync space: N KB of M KB used" from `syncStatus`; when sync is off: "Sync is off" (no bar). Relative time via `Intl.RelativeTimeFormat("en")`
- Footer: "Word list" (opens `wordlist.html` in a new tab) and "Settings" (`openOptionsPage`)
- Manifest permissions stay `["storage"]`; messaging to the active tab uses `browser.tabs.sendMessage` with the tab id from `tabs.query`, which needs no permission

## Settings page (`src/entrypoints/options/`)
Every section of the mock, bound to settings through `getSettings` / `setSettings` (live, so the open page reflects changes made elsewhere):
- Languages: three selects (learning: English; your language: Japanese; interface: English) — only the options that exist
- New-word level: range 1,000–20,000 step 500, label "Treat the N most common English words as known"
- Highlighting: three category rows with sample, description and switch; "Offer to save the rest when you finish" switch
- Dictionaries and AI: four checkboxes; "AI explanations inside the window" with Coming later — the description mentions "Chrome's built-in AI" only when `BrowserEnv.features.builtInAi`
- Video subtitles: position cards (In video / Below video) with the mock's previews; two translation switches
- Sites: YouTube / Netflix / other articles switches; "Never run on" list with remove buttons and "+ Add site" (inline input, validates a hostname)
- Sync and backup: "Sync word status with {syncName}" switch; usage + "Last saved …"; Backup file: "Last export: …" (or "Never exported"), Export (downloads `lingo-backup-YYYY-MM-DD.json` via a Blob URL) and Import (file input → `importJson`, then a short result line); "Your own cloud storage" Coming later
- About: version from the manifest and the data notices
- Left navigation with section links; the active section follows scrolling

## Word list page (`src/entrypoints/wordlist/`)
- Header: L badge, "Word list", language pair, Export / Import (same as Settings)
- Filters: search (head and short meaning), Status All / Learning / Known, Kind All / Words / Phrases, Sort Recently seen / A–Z / Most seen
- Table: Word (+ Phrase tag), Meaning (short), Status badge, Seen (occurrence count), Last seen (relative date)
- Details panel for the selected row: head, kind, speak, IPA, short, status buttons (Learning / Known / Remove), "Where you saw it · N" with source icon, title, meta (platform · time/date · "Saved here"), sentence, link (`occurrenceLink`)
- Data: new background requests if needed (`listTermsWithStats` returning term + short + count + lastSeen in one call; `lookup` for details). Large lists: render visible rows only if > 500 terms

## Also in M7
- On Netflix, lift the in-video subtitle above the control bar while the bar is visible (seen on netflix.com 2026-11-10)
- Mark PR #2 ready, retitle it, get CI green, merge (per the user's standing permission)

## Verification
Browser Mode tests for each screen's behavior; E2E: popup counts and This page save-all on the article fixture; settings changes reach the article page live; export → import round trip; word list filter/sort/detail/status change. Screenshot pairs against the mock for all three pages before committing.
