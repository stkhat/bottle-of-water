# Language data that scales — design proposal

Status: **proposal** (2026-11-11). Nothing here is implemented. Once adopted, the main [design spec](2026-11-08-language-learning-extension-design.md) is updated (see "Changes to the main spec") and this file stays as the record of the reasoning.

## Problem
- Every language pack is bundled with the extension. Today: two learning languages and three dictionaries, 19.1 MB of pack files, a 5.5 MB Chrome zip.
- Learning-language data (`en/`, `es/`: lemmas, frequency, IPA, phrases) is 3–4 MB per language. Dictionaries (`en-ja/`, `es-en/`, `en-defs/`) are 2–7 MB per **pair**, so they grow with learning × native languages. Ten learning languages with three native languages each would be roughly 185 MB of files (~50 MB zipped), while each user needs about 9 MB.
- Every dictionary fix needs a store release and review.
- The two pairs we have each rest on luck: en→ja on EJDict (a public-domain English–Japanese dictionary), es→en on English Wiktionary describing every language's words in English. Other native languages have neither.
- Selecting several words should show the meaning of the phrase or idiom they form. Today only contiguous phrases without "one's / someone" match, and a selection that is in no dictionary is machine-translated literally ("spill the beans" comes out as 豆をこぼす, "to spill beans").

## How other tools do it (researched 2026-11-11)
| Approach | Examples | Fit for Lingo |
|---|---|---|
| Server lookup per word | Language Reactor (`getFullDict`, see the main spec's LR notes), Relingo, Migaku, Readlang (accounts) | No: needs a developer server and sends the words the user reads |
| User imports dictionary files | Yomitan (zip files into IndexedDB) | No: too much work for a general audience |
| **Static data downloaded on demand** | 10ten Japanese Reader (~14 MB into IndexedDB, small diffs twice a week), Firefox Translations (models from Remote Settings when needed), Chrome's Translator API (language packs on demand) | **Yes**: no server logic, offline after download |

## Decisions

### 1. Distribution: download the chosen pair's data
- Pack files are not bundled (except during the migration, below). The extension downloads only the packs the chosen language pair needs.
- **Hosting**: static files in a separate **public** data repository (this repo is private), served from GitHub Releases or Pages, with jsDelivr as a mirror (its GitHub limit is 20 MB per file; packs stay under 4 MB per file). Files are immutable: `<pack>/<version>/<file>`. No server code runs anywhere.
- **Integrity**: a lock file bundled with the extension (`packs.lock.json`) lists every pack's version and each file's path, size and SHA-256, plus the mirror URLs. The background verifies each download with `crypto.subtle.digest` before using it, so the host does not need to be trusted and can be swapped.
- **Storage**: verified files go into Cache Storage (or OPFS) in the extension's origin, as they are. The background reads them with the existing loader, so load times and memory stay as today. (Not IndexedDB rows per entry: 10ten's 14 MB download grew to over 300 MB on disk because of indexes.)
- **When**: when the user picks a language pair in Settings; on another device when synced settings name a pair whose packs are missing; on extension update when the lock file changes (download the new version, switch only once all files verify, then delete the old one). Retries back off. Fetching needs no user gesture.
- **Without the data**: the language's highlights, hover card and dictionary window are unavailable and the UI says the language data is downloading or failed (copy and placement come from the mock).
- **Removal**: packs of a pair that is no longer chosen stay until removed in Settings.
- **Policy**: Chrome Web Store forbids remotely hosted code, not data. Packs are JSON read with `JSON.parse` and contain no logic. The privacy policy must say that pack files are fetched from the named host (which sees the IP address and which packs were fetched) and that no page content or words are sent.
- **Migration**: the first release keeps `en`, `en-ja` and `en-defs` bundled; `es` and every later language are downloaded. Both go through one loader interface (`PackSource`: bundled or downloaded), so the bundled packs can move out later.

### 2. What the data is split into
| Unit | Contents | How many |
|---|---|---|
| **Learning-language pack** `<L>` | lemmas, frequency, IPA, parts of speech, vocabulary, **phrase patterns** (see 4) | one per learning language, shared by every native language |
| **Phrase matcher** (code in `LanguagePack`) | the language's rules for matching selections and sentences to phrase patterns | one per learning language |
| **Pair dictionary** `<L>-<N>` | words and phrases under the same keys (a phrase's key is its pattern, e.g. `make up one's mind`), each sense tagged with its source | one per pair; a user downloads one |
| **English definitions** `<L>-en` | Wiktionary's English definitions of L's words and phrases (today's `en-defs` and `es-en`) | one per learning language; the pair dictionary when N = en, the last fallback otherwise |

A user with native language N ≠ en downloads `<L>`, `<L>-<N>` and `<L>-en`.

### 3. Native-language meanings: sources in order
Each pair has a build recipe (`scripts/data/`) that merges these sources. **Per term, the first source that has the term supplies its short translation and senses**; later sources only fill terms the earlier ones lack (mixing senses across sources would duplicate them).

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

**Quality gate**: a pair is offered in Settings only when human-made sources (1–3) give a native meaning for at least **95% of L's 5,000 most frequent base forms** (value to confirm). The browser's translator does not count, because its output is not reviewed and differs between devices. `npm run data:stats` reports each pair's coverage, including phrases.

### 4. Phrases and selections
- **Phrase patterns** (in `<L>`): a sequence of base forms and slots, a key, and flags.
  - Slots: `one's`, `someone`, `something`, `oneself` (English; each language lists its own).
  - `gap`: words may come between parts (phrasal verbs: "figure it out" → `figure out`), up to a limit per language.
  - `detect`: used for automatic highlighting.
- **Phrase matcher** (in `LanguagePack`, per language): maps a selection or sentence to patterns.
  - English: possessives (my, his, their…) fill `one's`, object pronouns fill `someone` / `something`, reflexives fill `oneself`; the gap rule for phrasal verbs.
  - Later languages add their own rules (German separable verbs "fängt … an" → `anfangen`, Spanish reflexives and clitics "me di cuenta" → `darse cuenta`).
- **Two modes**
  - **Detect** (highlighting): strict, as today — contiguous patterns flagged `detect`, no slots, the existing filters (be/have/do starts, very common words only). Saved phrases also match with slots and gaps, since the user chose them.
  - **Select** (the user selected words): every pattern, with slots and gaps. The pattern covering the most selected words wins; if the selection is part of a longer pattern that the sentence completes, the sentence decides.
- **Meaning of a selection**: the pattern's key is looked up in the pair dictionary with the source order of 3. A selection that matches no pattern gets a literal machine translation, marked as such (today's behavior plus the mark).
- **Saving**: a selection that matches a pattern is saved under the pattern's key ("made up her mind" is saved as `make up one's mind` and highlights "made up his mind" later). Phrases saved before this change keep their keys. The sync codec stores keys as strings, so it needs no change.

### 5. The browser's translator for definitions
- What is translated is the **English definition, not the phrase**: "spill the beans" literally gives "豆をこぼす"; its definition "To reveal a secret." gives "秘密を漏らす". The same keeps word senses apart ("light": "Having little weight" → 軽い).
- Before translating: drop leading labels ("(idiomatic, informal)"); skip pointer senses ("Alternative form of …").
- **Where it runs**: the Translator API is not available in workers, so not in the background service worker. The background returns the English senses marked as untranslated; the UI (content script or extension page) translates them and sends the results back. The background keeps them in IndexedDB (`mtCache`: key from L, N, term key, sense index and a hash of the English text; device only, never synced or exported).
- **How much**: the hover card translates the first sense; the dictionary window up to four. One queue with the subtitle translator, the current subtitle line first. Latency to be measured.
- **Language packs**: creating a translator for a pair Chrome still has to download needs user activation. Start it from Settings when the pair is chosen (a click) and when the dictionary window opens (a click); a hover card shows the English definition until the pack is there. For L = en, the en→N pack is the same one subtitles use; for L ≠ en, en→N is a second pack.
- **Display**: translated senses carry a "Machine translation" mark (copy from the mock). Lists (Words in this video, word list search) use pack data and translations already cached, never a new translation.
- **Browsers**: desktop Chrome 138+ and Edge 148+. Firefox, Safari and mobile show the English definition (detected by whether `Translator` exists, as today).
- **Not chosen: build-time machine translation.** Batch-translating definitions with Chrome's translator on the developer's machine is outside what the API is meant for, and its terms and output rights are unclear. If Firefox users or quality need it later, an openly licensed model run locally (Opus-MT, Firefox Translations models; licenses to check) can produce a source between 3 and 4.

### 6. Licenses
- Use only public-domain, MIT or CC BY-SA data; avoid GFDL-only and unlicensed data (e.g. the Gutenberg Korean–English dictionary is GFDL, Freelang lists are proprietary).
- Wiktionary-derived packs are CC BY-SA 4.0 (share-alike), so the data repository publishes packs under CC BY-SA with attribution; About and `THIRD_PARTY_NOTICES.md` list each source per pack.
- kaikki.org states no license of its own; its data inherits Wiktionary's.

### 7. UI (mock first)
The mock is canonical, so these are added to the mock before the spec's UI section changes:
- Settings → Languages: the language data of the chosen pair (size; Downloaded / Downloading n% / Failed with Retry; Remove for packs of pairs no longer chosen). Learning and native choices list only pairs that pass the quality gate.
- The state of a page while its language's data downloads or failed.
- "Machine translation" mark in the hover card and the dictionary window.
- Senses from translation tables: the English sense hint with the native words.

## Changes to the main spec once adopted
- Architecture: `LanguagePack` gains phrase patterns and the matcher; `DictionaryProvider` returns source tags; new `PackStore` (download, verify, cache) behind `PackSource`; "Where things run" (packs from Cache Storage; translation of definitions in the UI).
- Data sources: data repository, lock file, recipes per pair, the source order and the quality gate.
- Shared: hover card — phrase matching (slots, gaps, detect vs select) and phrase meanings (source order, machine translation of definitions).
- Settings page → Languages; Chrome vs Firefox table (translation row); Chrome Web Store requirements (data downloads, privacy policy); Risks (data licenses, host availability); Phases (where this lands).

## To verify before or during implementation
1. Coverage of source 2 for ko, zh, fr (downloads: ko 25.6 MB, zh 224 MB, fr 703 MB gzipped).
2. ECDICT's license (LICENSE file in the repository).
3. Quality of the browser's translator on ~100 English definitions (en→ja, en→ko), in the user's Chrome.
4. Translator latency next to subtitle translation; whether an offscreen document can host it (not needed if the UI does).
5. Cache Storage persistence and quota for an extension origin; whether `unlimitedStorage` is needed (and its install warning).
6. Hosting: fetching GitHub Release assets from the service worker (redirects, CORS with host permissions), jsDelivr as mirror.
7. The quality-gate value and the first native languages to add (candidates: zh, ko, es, pt, vi).

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
