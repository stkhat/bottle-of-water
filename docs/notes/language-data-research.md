# Language data — research (2026-11-11)

Why the language data is built and shipped the way [architecture.md](../specs/architecture.md) "Language data" describes.
Follow-up measurements of more native languages and sources (OMW, Wikidata Lexemes, English pivots; 2026-11-13): [translation-data-expansion.md](translation-data-expansion.md).

## Problem
- Before M9 every language pack was bundled: two learning languages and three dictionaries, 19.1 MB of pack files, a 5.5 MB Chrome zip.
- Learning-language data (`en/`, `es/`: lemmas, frequency, IPA, phrases) is 3–4 MB per language. Dictionaries (`en-ja/`, `es-en/`, `en-defs/`) are 2–7 MB per **pair**, so they grow with learning × native languages. Ten learning languages with three native languages each would be roughly 185 MB of files (~50 MB zipped), while each user needs about 9 MB.
- Every dictionary fix needs a store release and review. (This stays: the lock is bundled.)
- The first two pairs rested on luck: en→ja on EJDict (a public-domain English–Japanese dictionary), es→en on English Wiktionary describing every language's words in English. Other native languages have neither.
- Selecting several words should show the meaning of the phrase or idiom they form. Before M9a only contiguous phrases without "one's / someone" match, a selection shows no meaning at all (the bar over it only saves it), and a saved phrase that is in no dictionary is machine-translated literally ("spill the beans" comes out as 豆をこぼす, "to spill beans").

## How other tools do it
| Approach | Examples | Fit for Lingo |
|---|---|---|
| Server lookup per word | Language Reactor (`getFullDict`, [notes](language-reactor.md)), Relingo, Migaku, Readlang (accounts) | No: needs a developer server and sends the words the user reads |
| User imports dictionary files | Yomitan (zip files into IndexedDB) | No: too much work for a general audience |
| **Static data downloaded on demand** | 10ten Japanese Reader (~14 MB into IndexedDB, small diffs twice a week), Firefox Translations (models from Remote Settings when needed), Chrome's Translator API (language packs on demand) | **Yes**: no server logic, offline after download |

## Coverage of English Wiktionary's translation tables
(English Wiktionary, kaikki dump in `data/raw/`, 2026-11-11). Share of the most frequent English base forms (17,658 from `en/freq.json` through `en/lemmas.json`) with at least one translation:

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

## Coverage with the recipes (M9d)
Edition = the native language's Wiktionary edition; tables = English Wiktionary's translation tables.

| Native | edition (2) | tables (3) | both, top 2,000 | both, top 5,000 | phrases (19,932) |
|---|---|---|---|---|---|
| es | 78.3% | 95.1% | 98.4% | **96.8%** | 24.7% |
| pt | 60.8% | 93.6% | 96.7% | **95.1%** | 17.7% |
| zh | 36.1% | 88.1% | 94.4% | **91.2%** | 22.8% |

The Chinese edition lacks many common words (involve, available, ahead) and writes its meanings in Traditional characters, so zh would also need a conversion to Simplified. zh is left for later (user, 2026-11-11); es and pt pass.

## Quality gate details
- Words: the frequency list's base forms (an inflected form counts as its base). Not counted: function words (pronoun, determiner, article, preposition, conjunction, particle, contraction by `<L>/pos.json`, or an auxiliary such as can or must), contractions, single letters and names (words EJDict writes only with capitals: David, Paris, TV; `data/gate/en-capitalized.json`). Dictionaries and translation tables often lack them, and they sit within the known level
- The browser's translator does not count: its output is not reviewed and differs between devices

## Not chosen
- **ECDICT** (en→zh): its LICENSE says MIT, but its README and wiki list TheFreeDictionary, Linguee, Babylon, Google Translate and the unlicensed 屌丝字典 among its sources, and per-entry origins can no longer be traced (ECDICT issue #134; user, 2026-11-11)
- **Pivoting through English at build time**: es "banco" → bank, bench → "銀行, 土手, ベンチ" loses which sense was meant
- **Build-time machine translation**: outside what Chrome's translator is meant for; terms and output rights unclear. If needed later, an openly licensed local model (Opus-MT, Firefox Translations models) could add a source between the translation tables and display-time translation
- Other licenses: the Gutenberg Korean–English dictionary is GFDL, Freelang lists are proprietary

## Review findings that changed the first proposal
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
| A phrase with a gap is not one contiguous span | One span per part; gap words keep their own spans |
| A selection shows no meaning today; videos have no multi-word selection | A selection shows the matched phrase's hover card with its meaning (mock); video selection out of scope |
| No translation queue exists; the translator flag is detected in the service worker, where `Translator` never exists | One queue per page; detection in the UI |
| `mtCache` had no limit | 20,000 rows, least recently used out, cleared with the pair's packs |
| The gate's top 5,000 counted function words | Content words only |

## Still to check
- Translator latency next to subtitle translation
- IndexedDB quota for the extension origin with downloaded packs (`unlimitedStorage` is not needed: packs can be fetched again)
- Fetching from jsDelivr and unpkg in the user's Chrome, once the first packages are published (CORS checked with curl on 2026-11-11)

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
