# Status

Last update: 2026-11-15. Merged work is in git history; data sizes are in [notes/data-sizes.md](notes/data-sizes.md).

## Where we are
- Phases 1 and 2 and M9 (language data that scales) are built and merged: article UI, YouTube and Netflix video UI, YouTube comments, YouTube Shorts (subtitles and comments), popup, settings, word list; phrase detection and patterns, sentence history, Words tab, fullscreen; Spanish → English; English → Spanish and Portuguese; definitions translated at display time; downloadable packs (tested against a local mirror)
- Checked in the user's Chrome on YouTube (TED talk), Netflix (Friends `watch/70274124`) and Wikipedia
- Video ([ui](specs/ui.md) "Video UI"): phrases saved from subtitles and the transcript, pause while a card, the dictionary window, a selection or the pointer is on the subtitle, transcript sidebar beside a full-window player, Netflix's bar held back 1 s, Shorts tracks and ASR cards of at most 30 words ([notes](notes/youtube-captions.md)). Checked on YouTube and Netflix on 2026-11-13 and 11-14; the "Below video" box only in browser tests
- Highlight and video UI fixes (PR #68): "Details" on every hover card, white outline on the L / ^ group, selections partly over a highlight saved as selected, cheaper renders ([notes](notes/selection-performance.md)). Checked on YouTube and Netflix on 2026-11-14
- Language data rules ([architecture](specs/architecture.md) "Language data"; measured effect in [notes](notes/translation-quality.md) "Shipped rules"): hover lines and pointer senses, tags (A1, A2), phrase precision, phrase data (B2, C2), vocabulary from Wiktionary (E), names and written case (D), site translations on transcript cards (G), the 2026-11-14 hover fixes
- **Not yet checked in the user's Chrome**: the hover card's three senses, tags, phrase precision, phrase data, vocabulary, names, rule G and the 2026-11-14 hover fixes
- Word list "Learned" (2026-11-15; [ui](specs/ui.md) "Word list page"): Known words that went there from Learning, with the date, as a status filter; carried by browser sync (code `g`) and the JSON export. Records only changes made from this version on
- Codebase refactor done (PRs #33–#42): same behaviour, simpler code, light E2E, stricter checks
- Phase 3 "Meaning in context" (on-device AI in the dictionary window) and "Your meanings" (a meaning per sentence for words with several): designed and mock approved 2026-11-15, not built ([architecture](specs/architecture.md) "Meaning in context"; its checks come first). "Ask AI" links are not done (user, 2026-11-15)
- Next: phase 3 (meaning in context, Tatoeba, Anki/CSV export, more sites), sync to the user's own cloud storage (designed, [architecture](specs/architecture.md) "Sync to the user's own cloud storage"), or the store release ([roadmap](plans/roadmap.md))

## Known issues and open points

### Video
- Netflix's Japanese lines are loosely timed, so a few land on a neighboring transcript card; where a site's translation is cut finer than the cards and timed loosely, a short card left without its own line can now show its neighbour's (rule G); sound labels inside a cue stay in the card ("… ( chuckles )")
- Transcript sidebar in real fullscreen not checked in the user's Chrome: Chrome refuses fullscreen to Claude in Chrome's clicks ("not granted"); the narrowing itself was seen working on YouTube in fullscreen during the investigation, and browser tests cover real fullscreen on the fixture pages
- Netflix: the ^ menu goes away with Netflix's control bar when the pointer stops (it shows again with the bar)
- YouTube: real-site layout in theater mode and the narrow single-column layout not checked
- YouTube Shorts: ASR lines are split for the watch page's width (up to 60 characters), so a long one wraps into two or three lines over the narrow video; the dictionary window covers the comments panel while that is open
- YouTube: after using L or ^ the focus stays on Lingo's buttons, whose event isolation keeps YouTube's shortcuts (f, k) from reaching the player until the video is clicked
- YouTube ASR: where the English has no punctuation, a card boundary can be 1–3 words off (YouTube's own translation drifts). Where YouTube translates one English sentence as two, the card holds both, or the English is split at a comma. A card split for length (over 30 words) cuts its translation at the clause end said nearest the split; Japanese word order puts some clauses on the other part ("DDR5メモリの現在の価格を考えると、" under the English before it), and 7 of 199 split cards in the corpus show the whole translation on each part (no clause end there)
- YouTube Shorts: once, a full load with the user's caption language set to Japanese made no caption request at all, also not after Lingo asked the player for the English track ([notes](notes/youtube-shorts.md)); not seen again
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
- Some first meanings from Wiktionary fit badly ("used to" → "accustomed to"; "feel like" → ほしい for "I feel like we should"; "come in" → "To become relevant"; "get around" → moving round an obstacle, Wiktionary's first sense: its labels do not tell the literal sense apart reliably, see architecture "C2"); a few literal readings of idioms remain highlighted ("take it", "get it done", "give me reason", "play games"), and "a lot" and "thank you" are highlighted though learners know them (low value)
- Phrase data (B2): definitions that paraphrase their words leave useful phrases to selections ("as soon as", "in advance", "in particular", "may as well", "first thing"); B2b also takes some useful compounds for transparent (prime minister, blood vessel, civil service, real estate); B4 leaves out phrases written in Title Case in Wiktionary ("Your Royal Highness"). The judged useful share of highlights went from 94% to 79% while their number nearly tripled (precision before recall: the rules P1, P2 and the context checks apply on top)
- `en/phrases.json` (73,112 patterns) is 431 KB gzipped, loaded with every English page; the dictionary (`en-ja` with `en-defs`) parses in ~120 ms instead of ~85 ms in Node
- Phrase precision: the tagger reads some adverbial particles as prepositions, so P2 also drops useful phrasal verbs ("fill in the form", "stand by", "look after", "lean into"); literal vs idiomatic readings with the same tags stay ("go off", "cut out", "in time"); unpunctuated speech recognition loses a few prepositional phrases before a noun ("in particular transport")
- A saved phrasal verb may match words that do not belong together (up to three words between its parts; the phrase rules check detected phrases only)
- A phrase saved before M9a whose key contains a slot word ("someone else") also matches the slot's fillers ("him else")
- Machine-translated definitions: about 70 of 100 read well in Chrome's en→ja; fragments and jargon translate badly, so the window keeps the English under each sense. The first translation needs Chrome's model, whose download needs a click; until then hover cards show English
- Native editions' glosses are of mixed kinds (a word, a list, or a whole definition); translation-table senses can be rare words. Phrases are covered far less than words (es 24.7%, pt 17.7%)
- The gate's word list still counts some names EJDict writes in lowercase (billy, phoebe) and forms the lemma data lacks (gotten, ladies, nights)
- Tags (rules A1, A2): tagger errors move a few words to the wrong entry or senses (food coloring → color, "Left, right" → leave, "people dedicated to" → dedicate, gaming machines → game); "following X" (a preposition) shows follow's verb senses, as EJDict's "following" has no preposition sense; the light verbs' bases show their first senses (made → …を作る); EJDict's 〈C〉/ending heuristics mislabel a few senses (better: いっそうよく as a verb). The About line does not name UD English-EWT yet (THIRD_PARTY_NOTICES.md does)
- Vocabulary (rule E): the first definition of some new words is the wrong sense (cuz → "A cousin", kinda → a baboon, aka → a vine; the tagger does not move them); capitalised abbreviations get the lowercase word's definitions (Nov. → "A novice"); a name the names lexicon lacks as a given name stays a word (Ted → "A Teddy boy"). Wiktionary's words the TV list ranks (interjections, names, "goin") move the list's own words down a little (rank 3,000 → 3,077), so at level 3,000 1.5 more words per 1,000 tokens show as New. EJDict's own words the list lacks stay unranked (pandemic). `en/phrases.json` is 449 KB gzipped, just under its 450 KB budget
- Names (rule D): ALL-CAPS captions and lower-case speech recognition have no names (CHANDLER keeps ろうそく製造販売人); a place or organisation alone or after a name can still be taken for a name (Congress; "Bad Bunny" is a person); a run makes a few title words names after a name (Princess Diaries, Household Division); a capitalised word with a Title Case headword shows it even inside a title (Man → マン島 in a book title)
- Chinese is not offered: 91.2% of the gate (under 95%), and the zh edition writes Traditional characters. With OMW it reaches 96.1% (Simplified), pending a license decision; fr, de, ru and vi would also pass ([notes](notes/translation-data-expansion.md), [matrix](notes/language-matrix.html))

### Hosting and Firefox
- Pack hosting is pending: npm scope, public data repository, `npm publish`, then `npm run data:publish -- --download es,es-en` and a release. The real CDN download is checked only after that
- Firefox (not released): `data_collection_permissions` missing in the manifest; highlight-underline support not detected; check `adoptedStyleSheets` / `CSS.highlights` from a Firefox content script; the Firefox build is only built, not run as an extension (the browser tests run on Firefox: CI, and locally in Docker)

## Before publishing (Chrome Web Store)
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling, sentence history described in the listing ([architecture](specs/architecture.md) "Chrome Web Store requirements")
