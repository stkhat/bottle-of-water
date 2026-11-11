# Language data that scales — design

Status: **adopted** (2026-11-11), built in milestones M9a–M9d of the [roadmap](../plans/2026-11-09-roadmap.md). The main [design spec](2026-11-08-language-learning-extension-design.md) carries the result; this file keeps the reasoning. "Review notes" at the end lists what changed from the first proposal and why.

## Problem
- Every language pack is bundled with the extension. Today: two learning languages and three dictionaries, 19.1 MB of pack files, a 5.5 MB Chrome zip.
- Learning-language data (`en/`, `es/`: lemmas, frequency, IPA, phrases) is 3–4 MB per language. Dictionaries (`en-ja/`, `es-en/`, `en-defs/`) are 2–7 MB per **pair**, so they grow with learning × native languages. Ten learning languages with three native languages each would be roughly 185 MB of files (~50 MB zipped), while each user needs about 9 MB.
- Every dictionary fix needs a store release and review. (This stays: see "Integrity".)
- The two pairs we have each rest on luck: en→ja on EJDict (a public-domain English–Japanese dictionary), es→en on English Wiktionary describing every language's words in English. Other native languages have neither.
- Selecting several words should show the meaning of the phrase or idiom they form. Today only contiguous phrases without "one's / someone" match, a selection shows no meaning at all (the bar over it only saves it), and a saved phrase that is in no dictionary is machine-translated literally ("spill the beans" comes out as 豆をこぼす, "to spill beans").

## How other tools do it (researched 2026-11-11)
| Approach | Examples | Fit for Lingo |
|---|---|---|
| Server lookup per word | Language Reactor (`getFullDict`, see the main spec's LR notes), Relingo, Migaku, Readlang (accounts) | No: needs a developer server and sends the words the user reads |
| User imports dictionary files | Yomitan (zip files into IndexedDB) | No: too much work for a general audience |
| **Static data downloaded on demand** | 10ten Japanese Reader (~14 MB into IndexedDB, small diffs twice a week), Firefox Translations (models from Remote Settings when needed), Chrome's Translator API (language packs on demand) | **Yes**: no server logic, offline after download |

## Decisions

### 1. Distribution: download the chosen pair's data
- Pack files are not bundled (except during the migration, below). The extension downloads only the packs the chosen language pair needs.
- **Hosting**: one **npm package per pack** (`@<scope>/<pack>`, e.g. `en-ko`), served by **jsDelivr** (`cdn.jsdelivr.net/npm/…`) and **unpkg** (`unpkg.com/…`), tried in that order. Both send `Access-Control-Allow-Origin: *`, so the background fetches them without host permissions. npm versions are immutable, and a package may hold up to 150 MB. The build output and the recipes' notices live in a separate **public** data repository (this repo is private). No server code runs anywhere.
- **Integrity**: a lock file bundled with the extension (`src/core/packs/packs.lock.json`) lists each pack's version, data `format`, whether it is bundled, and each file's path, size and SHA-256, plus the mirror URL templates and the offered pairs. The background verifies each download with `crypto.subtle.digest` before using it, so the hosts do not need to be trusted and can be swapped. Data fixes therefore ship with an extension release. The lock's shape leaves room for a signed remote index later (a pack list signed with a key whose public half is bundled), should data need to change between releases.
- **Storage**: verified files go into IndexedDB (the existing Dexie database), **one row per file** holding the file as a Blob, keyed by its SHA-256, plus a row per pack naming its active version. The background reads them with the existing loader (`createPackLoader` over a `FetchJson` that reads either the bundled file or the stored one), so load times and memory stay as today. (Not one row per entry: 10ten's 14 MB download grew to over 300 MB on disk because of indexes.)
- **When**: when the user picks a language pair in Settings; on another device when synced settings name a pair whose packs are missing; on extension update when the lock file changes. A new version is fetched next to the old one; files whose SHA-256 is already stored are not fetched again (an update downloads only the changed shards); the pack switches to the new version in one transaction once all its files verify, then files nothing refers to are deleted. Each stored file is recorded at once, so a download stopped with the service worker continues where it stopped. Retries back off through `alarms` (no install warning), since timers die with the service worker. Fetching needs no user gesture.
- **Without the data**: the background answers requests that need a missing pack with `packsUnavailable`. The packs' state (downloading with bytes received, failed, ready) is kept in `storage.local`, which pages and Settings watch: the language's highlights, hover card and dictionary window are unavailable, the UI says the language data is downloading or failed (copy and placement come from the mock), and pages analyze again once the data is ready.
- **Data format**: each pack's `format` in the lock must match the format the extension's code reads. A stored version in an older format is not used; until its newer version is fetched the pack counts as downloading.
- **Removal**: packs of a pair that is no longer chosen stay until removed in Settings.
- **Policy**: Chrome Web Store forbids remotely hosted code, not data. Packs are JSON read with `JSON.parse` and contain no logic. The privacy policy must say that pack files are fetched from the named hosts (which see the IP address and which packs were fetched) and that no page content or words are sent.
- **Migration**: the first release keeps `en`, `en-ja` and `en-defs` bundled; `es`, `es-en` and every later pack are downloaded. Both go through one loader interface (`PackSource`: bundled or downloaded), so the bundled packs can move out later. Downloaded packs are built into `data/packs/` (committed, so tests read them) instead of `public/packs/`.

### 2. What the data is split into
| Unit | Contents | How many |
|---|---|---|
| **Learning-language pack** `<L>` | lemmas, frequency, IPA, parts of speech, vocabulary, **phrase patterns** (see 4) | one per learning language, shared by every native language |
| **Phrase matcher** (code in `LanguagePack`) | the language's rules for matching selections and sentences to phrase patterns | one per learning language |
| **Pair dictionary** `<L>-<N>` | words and phrases under the same keys (a phrase's key is its pattern, e.g. `make up one's mind`), each term tagged with the source it came from | one per pair; a user downloads one |
| **English definitions** `<L>-en` | Wiktionary's English definitions of L's words and phrases (today's `en-defs`, which holds phrases only, and `es-en`) | one per learning language; the pair dictionary when N = en, the last fallback otherwise |

A user with native language N ≠ en downloads `<L>`, `<L>-<N>` and `<L>-en`. `<L>-en` must cover words as well as phrases for that fallback; today's `en-defs` covers only phrases, which is enough for en→ja (EJDict has every vocabulary word), so the full English one is built with the first native language other than ja.

### 3. Native-language meanings: sources in order
Each pair has a build recipe (`scripts/data/recipes/`) that merges these sources. **Per term, the first source that has the term supplies its short translation and senses**; later sources only fill terms the earlier ones lack (mixing senses across sources would duplicate them). So the source tag is one per term, not per sense.

1. **A dedicated bilingual dictionary** with a usable license: EJDict (en→ja, public domain), ECDICT (en→zh, MIT — to be confirmed from its LICENSE file), JMdict (ja→many, CC BY-SA). None with a usable license was found for en→ko.
2. **The native language's own Wiktionary edition**: its entries for L's words, defined in N (kaikki.org extracts 20 editions: zh, cs, nl, fr, de, el, id, it, ja, ko, ku, ms, pl, pt, ru, simple, es, th, tr, vi). Coverage not measured yet.
3. **English Wiktionary's translation tables**: per English sense, the words in N. Senses keep the English sense label as a hint ("[of low weight] 가볍다"). Only English headwords have them in English Wiktionary; for L ≠ en use L's own edition's tables instead.
4. **The browser's translator, at display time**: translates the English definition from `<L>-en` (see 5). Not part of any pack.
5. **The English definition as it is** (browsers without a translator).

No pivoting through English at build time (es "banco" → bank, bench → "銀行, 土手, ベンチ": the English step loses which sense was meant).

**Measured coverage of source 3** (English Wiktionary, kaikki dump in `data/raw/`, 2026-11-11). Share of the most frequent English base forms (17,658 from `en/freq.json` through `en/lemmas.json`) with at least one translation:

| Native | top 2,000 | top 5,000 | top 10,000 | all 17,658 | idioms and phrases (17,052) |
|---|---|---|---|---|---|
| de / es / fr / ru | ~96% | ~94–95% | ~91% | ~85–86% | ~19–21% (ru not measured) |
| pt | 95.0% | 93.4% | 87.6% | 79.6% | 12.7% |
| ja (reference) | 91.7% | 87.0% | 76.6% | 64.8% | 7.4% |
| zh (cmn) | 77.5% | 80.7% | 75.4% | 67.2% | 13.0% |
| ko | 86.5% | 78.4% | 64.2% | 51.2% | 4.1% |
| tr / ar | 86–89% | ~80% | ~68% | 54–57% | — |
| vi / th / id | 70–81% | 61–70% | 48–54% | 36–41% | 3.2% (vi) |

Missing are mostly function words (him, would, an, them, into) but also common words (upset, concern, involve, deserve, bother for ko). Some translations are poor (en-ja "add fuel to the fire" → 鬼に金棒). So source 3 alone serves the major European languages; Asian native languages need source 1 or 2, and idioms need source 4 almost everywhere.

**Quality gate**: a pair is offered in Settings only when human-made sources (1–3) give a native meaning for at least **95% of L's 5,000 most frequent content words** (value to confirm). Function words (pronouns, determiners, prepositions, conjunctions, auxiliaries, by `<L>/pos.json`) are not counted: dictionaries and translation tables often lack them, and they sit within the known level. The browser's translator does not count, because its output is not reviewed and differs between devices. `npm run data:stats` reports each pair's coverage by source, including phrases, also as JSON, and fails when an offered pair is under the gate. The lock's `pairs` lists the pairs that pass; Settings offers only those.

### 4. Phrases and selections
- **Phrase patterns** (in `<L>`): a sequence of words and slots, a key, and flags.
  - Slots: `one's`, `someone`, `something`, `oneself` (English; Wiktionary's "somebody", "sb" and "sth" are written as `someone` / `something`). Each language lists its own (Spanish: `alguien`, `algo`).
  - A pattern's word matches a token whose written form or any base form equals it, so keys keep Wiktionary's wording: "spill the beans" matches "spilled the beans" (beans as written, spill as a base form).
  - `gap`: words may come between parts (phrasal verbs: "figure it out" → `figure out`), up to a limit per language.
  - `detect`: used for automatic highlighting.
- **Phrase matcher** (in `LanguagePack`, per language): maps a selection or sentence to patterns.
  - English: possessives (my, his, their…) fill `one's`, object pronouns fill `someone` / `something`, reflexives fill `oneself`; the gap rule for phrasal verbs.
  - Later languages add their own rules (German separable verbs "fängt … an" → `anfangen`, Spanish reflexives and clitics "me di cuenta" → `darse cuenta`).
- **Two modes**
  - **Detect** (highlighting): strict, as today — contiguous patterns flagged `detect`, no slots, the existing filters (be/have/do starts, very common words only). Saved phrases also match with slots and gaps, since the user chose them.
  - **Select** (the user selected words): every pattern, with slots and gaps. The pattern covering the most selected words wins; if the selection is part of a longer pattern that the sentence completes, the sentence decides.
- **A phrase with a gap is not one range**: its span has parts (`turn` and `off` in "turn the lights off"), and the words in the gap keep their own spans, so "lights" is still highlighted and hovered as a word.
- **Meaning of a selection**: on articles, a selection shows the same card as a hovered phrase (status "Selected · not saved") for the phrase the selection matched, with its short meaning. The pattern's key is looked up in the pair dictionary with the source order of 3. A selection that matches no pattern gets a literal machine translation, marked as such. Video subtitles have no multi-word selection; that stays so unless the mock adds it.
- **Saving**: a selection that matches a pattern is saved under the pattern's key ("made up her mind" is saved as `make up one's mind` and highlights "made up his mind" later). Phrases saved before this change keep their keys. The sync codec stores keys as strings, so it needs no change.

### 5. The browser's translator for definitions
- What is translated is the **English definition, not the phrase**: "spill the beans" literally gives "豆をこぼす"; its definition "To reveal a secret." gives "秘密を漏らす". The same keeps word senses apart ("light": "Having little weight" → 軽い).
- Before translating: drop leading labels ("(idiomatic, informal)"); skip pointer senses ("Alternative form of …").
- **Where it runs**: the Translator API is not available in workers, so not in the background service worker. The background returns the English senses marked as untranslated; the UI (content script or extension page) translates them and sends the results back. The background keeps them in IndexedDB (`mtCache`: key from L, N, term key, sense index and a hash of the English text; at most 20,000 rows, the least recently used go first; cleared with the pair's packs; device only, never synced or exported).
- **Whether it can run** is detected where it runs (the UI). `BrowserEnv`'s translator flag, detected in the service worker, is always false there and is not used for this.
- **How much**: the hover card translates the first sense; the dictionary window up to four. One queue per page with the subtitle translator: the current subtitle line first, then the dictionary window, then the hover card. Latency to be measured.
- **Language packs**: creating a translator for a pair Chrome still has to download needs user activation. Start it from Settings when the pair is chosen (a click) and when the dictionary window opens (a click); a hover card shows the English definition until the pack is there. For L = en, the en→N pack is the same one subtitles use; for L ≠ en, en→N is a second pack.
- **Display**: translated senses carry a "Machine translation" mark (copy from the mock). Lists (Words in this video, word list search) use pack data and translations already cached, never a new translation.
- **Browsers**: desktop Chrome 138+ and Edge 148+. Firefox, Safari and mobile show the English definition (detected by whether `Translator` exists, as today).
- **Not chosen: build-time machine translation.** Batch-translating definitions with Chrome's translator on the developer's machine is outside what the API is meant for, and its terms and output rights are unclear. If Firefox users or quality need it later, an openly licensed model run locally (Opus-MT, Firefox Translations models; licenses to check) can produce a source between 3 and 4.

### 6. Licenses
- Use only public-domain, MIT or CC BY-SA data; avoid GFDL-only and unlicensed data (e.g. the Gutenberg Korean–English dictionary is GFDL, Freelang lists are proprietary).
- Wiktionary-derived packs are CC BY-SA 4.0 (share-alike), so the data repository and the npm packages publish packs under CC BY-SA with attribution; About and `THIRD_PARTY_NOTICES.md` list each source per pack.
- kaikki.org states no license of its own; its data inherits Wiktionary's.

### 7. UI (mock first)
The mock is canonical, so these are added to the mock before the spec's UI section changes:
- A selection on an article shows the hover card of the phrase it matched, with its short meaning; a literal translation carries the "Machine translation" mark.
- "Machine translation" mark in the hover card and the dictionary window.
- Senses from translation tables: the English sense hint with the native words.
- Settings → Languages: a "Language data" row with the data of the chosen pair (size; Downloaded / Downloading n% / Failed with Retry) and of pairs no longer chosen (size, Remove) nested under it. Learning and native choices list only pairs that pass the quality gate.
- The state of a page while its language's data downloads or failed.

## Testing
- Unit tests use the existing pack stubs (`src/background/test-packs.ts`); the pack store is tested against IndexedDB in Browser Mode, with fetch stubbed (wrong hash, failed mirror, resume, version switch, format mismatch).
- E2E never reaches the network: Playwright serves the built npm package folders from a local server, and test builds take their mirror list from an environment variable. Production builds always use jsDelivr and unpkg.
- The real hosts are checked with the check build in the user's Chrome once the first packages are published.

## To verify before or during implementation
1. Coverage of source 2 for ko, zh, fr (downloads: ko 25.6 MB, zh 224 MB, fr 703 MB gzipped).
2. ECDICT's license (LICENSE file in the repository).
3. Quality of the browser's translator on ~100 English definitions (en→ja, en→ko), in the user's Chrome.
4. Translator latency next to subtitle translation.
5. IndexedDB quota for the extension origin (`navigator.storage.estimate`) with downloaded packs; `unlimitedStorage` is not needed for packs, which can be fetched again.
6. Fetching from jsDelivr and unpkg in the service worker of the user's Chrome (CORS checked with curl on 2026-11-11).
7. The quality-gate value and the first native languages to add (candidates: zh, ko, es, pt, vi).

## Review notes (2026-11-11)
Found while planning the implementation; each changed the first proposal as written above.

| Finding | Change |
|---|---|
| GitHub Release assets redirect to `release-assets.githubusercontent.com`, which sends no CORS header, so the service worker would need host permissions (a review justification, and opt-in in Firefox MV3) | Hosting on npm via jsDelivr and unpkg, both `Access-Control-Allow-Origin: *` |
| jsDelivr's GitHub mode serves at most ~50 MB per repository at a ref (jsDelivr issues #18760, #18750); GitHub Pages caps a site at 1 GB with a soft 100 GB/month bandwidth | One npm package per pack (150 MB each) |
| Cache Storage takes only http(s) keys; Firefox allows the Cache API on `moz-extension:` only behind its background-service-worker pref (bug 1575625), while Firefox's background is an event page; no transactions for the version switch; no Cache Storage in Node tests | IndexedDB, one row per file |
| A bundled lock means data fixes ship with releases | Accepted; `format` per pack added; room left for a signed remote index |
| The service worker can stop mid-download, and timers die with it | Files recorded one by one, stored hashes skipped, retries through `alarms` |
| Pages assumed `analyze` and `lookup` always succeed | `packsUnavailable` and pack state in `storage.local` |
| `en-defs` holds phrases only | `<L>-en` covers words too, from the first native language other than ja |
| Source tags per sense contradicted "the first source supplies the term" | One tag per term |
| Keys with an inflected word ("spill the beans") could never match base forms | Pattern words match the written form or a base form |
| A phrase with a gap is not one contiguous span | Spans with parts; gap words keep their own spans |
| A selection shows no meaning today; videos have no multi-word selection | A selection shows the matched phrase's hover card with its meaning (mock); video selection out of scope |
| No translation queue exists; the translator flag is detected in the service worker, where `Translator` never exists | One queue per page; detection in the UI |
| `mtCache` had no limit | 20,000 rows, least recently used out, cleared with the pair's packs |
| The gate's top 5,000 counted function words | Content words only |

## Sources
- Chrome Web Store, package limit (2 GB): https://developer.chrome.com/docs/webstore/publish
- Remotely hosted code (data is allowed): https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- Translator API: https://developer.chrome.com/docs/ai/translator-api ; built-in AI in extensions: https://developer.chrome.com/docs/extensions/ai ; explainer: https://github.com/webmachinelearning/translation-api
- Firefox Translations hosting: https://firefox-source-docs.mozilla.org/toolkit/components/translations/resources/02_contributing.html
- 10ten Japanese Reader data: https://www.pkgstats.com/pkg:@birchill/jpdict-idb
- Yomitan dictionaries: https://github.com/MarvNC/yomitan-dictionaries
- kaikki.org editions: https://kaikki.org/dictionary/rawdata.html ; wiktextract: https://github.com/tatuylonen/wiktextract
- WikDict / DBnary (CC BY-SA 4.0): https://www.wikdict.com/page/about , https://kaiko.getalp.org/about-dbnary/
- ECDICT: https://github.com/skywind3000/ECDICT
- jsDelivr limits: https://github.com/jsdelivr/jsdelivr/issues/18760 , https://github.com/jsdelivr/jsdelivr/issues/18750
- Cache API in Firefox extensions: https://bugzilla.mozilla.org/show_bug.cgi?id=1575625 ; Cache.put (http/https only): https://developer.mozilla.org/en-US/docs/Web/API/Cache/put
