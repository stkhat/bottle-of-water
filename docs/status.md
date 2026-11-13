# Status

Last update: 2026-11-13. Merged work is in git history; data sizes are in [notes/data-sizes.md](notes/data-sizes.md).

## Where we are
- Phases 1 and 2 and M9 (language data that scales) are built and merged: article UI, YouTube and Netflix video UI, YouTube comments, YouTube Shorts (subtitles and comments), popup, settings, word list; phrase detection and patterns, sentence history, Words tab, fullscreen; Spanish → English; English → Spanish and Portuguese; definitions translated at display time; downloadable packs (tested against a local mirror)
- Checked in the user's Chrome on YouTube (TED talk), Netflix (Friends `watch/70274124`) and Wikipedia
- Video subtitles and the transcript: selecting 2–8 words saves a phrase as on articles, and the video pauses while a card, the dictionary window or a selection is open; checked on YouTube and Netflix on 2026-11-13
- Transcript sidebar: where the player fills the window or the screen (Netflix, YouTube in fullscreen) the player is narrowed and the transcript sits beside it; × and the menu's "Show transcript in sidebar" close and reopen the column everywhere. Checked on Netflix in the window and on the YouTube watch page on 2026-11-13
- Hover card: up to three senses, one per line, all the same size (2026-11-13); machine-translated meanings keep one line. Not yet checked in the user's Chrome
- Hover lines by rule (2026-11-13): a pointer sense ("goの過去", "=anyhow", "Plural of …") is followed to the word it names (went → goの過去 + go's meanings), and each line is one sense within 25 Japanese characters (40 for definitions). Over 153k hovers of the translation-quality corpus, hovers showing only a pointer went 11,764 → 4,905 (the rest are contractions) and lines wider than 25 Japanese characters 21,750 → 328 (pointers, kept whole). The tagger-dependent part (decided → decide, auxiliary "has been") waits for a part-of-speech tagger
- Codebase refactor done (PRs #33–#42): same behaviour, simpler code, light E2E, stricter checks
- Next: phase 3 (Ask AI / LLM explanations, Tatoeba, Anki/CSV export, more sites) or the store release ([roadmap](plans/roadmap.md))

## Known issues and open points

### Video
- Netflix's Japanese lines are loosely timed, so a few land on a neighboring transcript card; sound labels inside a cue stay in the card ("… ( chuckles )")
- Transcript sidebar in real fullscreen not checked in the user's Chrome: Chrome refuses fullscreen to Claude in Chrome's clicks ("not granted"); the narrowing itself was seen working on YouTube in fullscreen during the investigation, and browser tests cover real fullscreen on the fixture pages
- Netflix: the ^ menu goes away with Netflix's control bar when the pointer stops (it shows again with the bar)
- YouTube: real-site layout in theater mode and the narrow single-column layout not checked
- YouTube Shorts: ASR lines are split for the watch page's width (up to 60 characters), so a long one wraps into two or three lines over the narrow video; the dictionary window covers the comments panel while that is open
- YouTube: after using L or ^ the focus stays on Lingo's buttons, whose event isolation keeps YouTube's shortcuts (f, k) from reaching the player until the video is clicked
- YouTube ASR: where the English has no punctuation, a card boundary can be 1–3 words off (YouTube's own translation drifts) and a card can hold a long run-on (up to ~70 words), shown as several lines. Where YouTube translates one English sentence as two, the card holds both, or the English is split at a comma
- Subtitles: the outline of the term whose dictionary window is open goes around the clicked part of a gap phrase only
- Video lines that play while the language data is missing are classified later but not kept in the sentence history

### YouTube comments
- Short comments ("lol", "wow") are often not decided by the language detector and count as the learning language
- A comment cut off by "Read more" is analyzed whole; its hidden part gets highlights once expanded

### Articles
- A word saved in another tab shows on an open page only after it is classified again (reload or a known-level change)
- Wikipedia sentences keep citation brackets ("5] …", "…[") in "On this page" and the history
- A page whose first analysis ends just as the language pair changes can log "No dictionary from en to en": `warmDictionary` pairs the page's language with the new native language (a rare E2E flake in `extension-errors.spec.ts`)
- On an article whose language pack is there but whose dictionary is not (one of the pair's packs failed), hovering a word shows nothing and logs nothing

### Popup, word list, history, sync
- Popup: "On this site" reflects only `disabledSites` (a "Never run on" host still shows the switch on); relative times read "2 minutes ago" where the mock says "2 min ago"
- Word list: re-saving a removed word brings back one occurrence (removal deletes the others)
- A saved phrase only finds history sentences recorded after it was saved (index keys are fixed when a sentence is kept)
- The 50 MB history figure is Lingo's own estimate; IndexedDB's indexes take more space on disk
- `storage.sync` holds about 12,400 English terms; demotion of "save all" terms keeps it working

### Phrases and language data
- Some first meanings from Wiktionary fit badly ("talk about" → an interjection sense, "used to" → "accustomed to"); a few literal word pairs remain ("and change"); "of course" and "a lot" are not in the list
- A saved phrasal verb may match words that do not belong together (up to three words between its parts; no part-of-speech check)
- A phrase saved before M9a whose key contains a slot word ("someone else") also matches the slot's fillers ("him else")
- Phrases dropped only by the rank thresholds ("see you later", "in it") are in neither `detect` nor `more`, so a selection cannot match them
- Machine-translated definitions: about 70 of 100 read well in Chrome's en→ja; fragments and jargon translate badly, so the window keeps the English under each sense. The first translation needs Chrome's model, whose download needs a click; until then hover cards show English
- Native editions' glosses are of mixed kinds (a word, a list, or a whole definition); translation-table senses can be rare words. Phrases are covered far less than words (es 24.7%, pt 17.7%)
- The gate's word list still counts some names EJDict writes in lowercase (billy, phoebe) and forms the lemma data lacks (gotten, ladies, nights)
- Chinese is not offered: 91.2% of the gate (under 95%), and the zh edition writes Traditional characters. With OMW it reaches 96.1% (Simplified), pending a license decision; fr, de, ru and vi would also pass ([notes](notes/translation-data-expansion.md), [matrix](notes/language-matrix.html))

### Hosting and Firefox
- Pack hosting is pending: npm scope, public data repository, `npm publish`, then `npm run data:publish -- --download es,es-en` and a release. The real CDN download is checked only after that
- Firefox (not released): `data_collection_permissions` missing in the manifest; highlight-underline support not detected; check `adoptedStyleSheets` / `CSS.highlights` from a Firefox content script; the Firefox build is only built, not run (Playwright's Firefox does not launch on the dev Mac; CI runs Firefox browser tests)

## Before publishing (Chrome Web Store)
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling, sentence history described in the listing ([architecture](specs/architecture.md) "Chrome Web Store requirements")
