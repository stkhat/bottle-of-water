# Meaning in context: checks before building (phase 3 M0)

**Done 2026-11-15/16**: C1 (API surface), C2 (latency, `clone()`), C3 (quality on 300 terms with dictionary meanings and 60 without, blind judged), C4 (Spanish and English answers). The user decides at the gate ("Decisions for the gate"). The study folder `data/raw/quality/2026-11-context/` (git-ignored) has the probe, prototype, batches, results, packets and judgements, and a README.

Plan: [plans/meaning-in-context.md](../plans/meaning-in-context.md) "M0". Design: [architecture](../specs/architecture.md) "Meaning in context", [ui](../specs/ui.md) "Meaning in context and your meanings".

## Method
- The user's Chrome **157.0.8103.51** (macOS), through Claude in Chrome, with a throwaway check build (never merged; its source is `probe.patch` in the study folder). A content script answers the page's `window.postMessage({type: "lingo:ai-probe", …})`; the service worker, an extension page (opened as a tab) and an offscreen document answer through the background. Prompt batches came from a local study server through the service worker (host permission `http://127.0.0.1:8765/*`); results went back the same way, so no corpus text passed through the page.
- Each context was asked: does `LanguageModel` exist, its static and session members, `availability()` with no options and per language pair (`expectedInputs`/`expectedOutputs`), `create()` without a user activation, `measureContextUsage`/`measureInputUsage` with and without a `responseConstraint`, one prompt with a JSON schema, `clone()`.
- Latency: the 2026-11 corpus (YouTube), terms from the earlier Nano sense study, the prototype prompt (`proto/explain.ts`: English instructions as a system prompt, the term marked `[[ ]]` in its sentence, the pack's numbered senses with parts of speech, lines around it with their site translation). Each prompt in a fresh session created with the instructions, timed separately: `create()`, then `prompt()` with the schema `{meaning: string, explanation: string, sense: integer | null}`.
- Docs read on 2026-11-15: [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) and [Prompt API for extensions](https://developer.chrome.com/docs/extensions/ai/prompt-api) (both last updated 2026-10-21), [Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).

## C1. Where and how `LanguageModel` works

| Context | `LanguageModel` | `availability()` | en→ja | es→en | en→es | en→pt | Members | `create()` without activation (model present) |
|---|---|---|---|---|---|---|---|---|
| Content script, top frame (en.wikipedia.org, example.com, youtube.com watch page, netflix.com/browse) | yes | `available` | available | available | available | **unavailable** | `contextWindow`, `contextUsage`, `measureContextUsage`, `oncontextoverflow`, `prompt`, `promptStreaming`, `clone`, `destroy`, `append`, `when`; no `inputQuota`, `params`, `topK`, `temperature` | works |
| Content script, cross-origin iframe without `allow="language-model"` (youtube.com/embed in example.com) | yes | **`unavailable`** | unavailable | – | – | – | – | `NotAllowedError: Access denied because the Permission Policy is not enabled.` |
| Content script, cross-origin iframe with `allow="language-model"` | yes | `available` | available | – | – | – | as top frame | works |
| Extension page (tab) | yes | `available` | available | available | available | unavailable | the above plus the old names `inputQuota`, `inputUsage`, `measureInputUsage`, `onquotaoverflow`, `topK`, `temperature`; `LanguageModel.params()` exists | works |
| Offscreen document (reason `WORKERS`) | yes | `available` | available | available | available | unavailable | as extension page | works |
| Service worker | yes | `available` | available | available | available | unavailable | as extension page | works |
| The web page itself (main world; not Lingo's) | yes (en.wikipedia.org, netflix.com) | – | – | – | – | – | – | works (one session prompted) |

Other pairs read in a content script: en→de, en→fr, ja→ja, es→es, es→ja available; en→it, en→ko, en→zh, any pair with pt (pt, pt-BR, pt-PT, either side) unavailable. The docs list "en", "ja", "es", "de" and "fr". `create()` with `expectedOutputs` pt throws `NotSupportedError: The requested language options are not supported.`; a session made without language options still answers in Portuguese when asked (one try), but Chrome does not support it.

Details:
- **Input limit**: `contextWindow` 9,216 tokens in every context (`inputQuota` the same where it exists). `measureContextUsage` gives the same number with and without `responseConstraint` (22 tokens for a one-line prompt), so it does **not** count the schema in this version; the context used after a prompt is larger than the measured prompt plus the answer (see C2).
- **Download progress**: `monitor` → `downloadprogress` fires `0` and `1` even when the model is already there.
- **Schema**: `responseConstraint` with `sense: {type: ["integer", "null"]}` is accepted; 100 of 100 answers so far parsed as JSON with the right fields (C2).
- **User activation**: with the model `available`, `create()` works with no activation in every context (`navigator.userActivation.isActive` false). A Claude in Chrome click on a button in a closed shadow root, handled by the content script, had `isActive` true, still true after `await availability()`. The model was already downloaded, so a download itself was not tried; the docs say a download needs the user to "meaningfully interact" with the page (`downloadable`: "user activation may be required").
- **Offscreen download**: not tried (model present). An offscreen document never has a user activation (`isActive` false, `hasBeenActive` false), so per the docs it cannot start a download.
- **`create()` cost**: without `initialPrompts` it resolves in about 1 ms; with the instructions as a system prompt about 0.7–0.9 s per fresh session (C2), and 9.3 s for the first such session in the browser session (the base session of the first batch).
- **Policy**: the current Prompt API pages name no permission, manifest key or acknowledgment step for extensions (the expired `aiLanguageModelOriginTrial` permission should be removed). A web search result quotes an earlier version of the Prompt API page: developers should acknowledge Google's Generative AI Prohibited Uses Policy before use. Either way it is a developer obligation with no API or manifest mechanism.
- **Disk**: the docs say the model is removed when free space falls below 10 GB after download and downloaded again once the requirements are met (22 GB free on the profile's volume, more than 4 GB VRAM or 16 GB RAM and 4 cores). They do not say what `availability()` returns meanwhile.
- **Workers**: the docs say the API is not in Web Workers; it is in the extension service worker.

## C2. Latency (fresh sessions)
30 YouTube terms from the sample (`batches/c2-fresh`), content script on example.com, the tab in front. One prompt per fresh session; times in ms; tokens are `measureContextUsage` of the prompt (instructions and schema not included).

| Context in the prompt | Prompts | Input tokens p50 / p90 | `create()` p50 / p90 | `prompt()` p50 / p90 | Max |
|---|---|---|---|---|---|
| Sentence only (with its subtitle) | 30 | 142 / 208 | 646 / 824 | 1,633 / 2,014 | 3,146 |
| 5 lines | 30 | 417 / 514 | 652 / 830 | 2,276 / 2,809 | 4,090 |
| 10 lines | 29 | 603 / 740 | 651 / 805 | 2,628 / 3,824 | 5,520 |
| 20 lines | 30 | 946 / 1,222 | 648 / 894 | 3,897 / 5,264 | 6,007 |
| Most that fits (9,216 − context used − 400) | 30 | 8,460 / 8,548 | 660 / 673 | 19,075 / 20,019 | 20,129 |

- "Most that fits" held 190 lines at the median (22–400; the batch offered at most 400, and short videos have fewer). Finding it took 1–10 `measureContextUsage` calls, 36 ms at the median (a binary search over the line count).
- Prompt time grows about linearly: about 1.6 s plus 2.1 ms per input token (least squares over all 149 prompts).
- `contextUsage` after a prompt was about 360–375 tokens more than the measured prompt: the instructions (system prompt), the schema and the answer together.
- Answers: 150 of 150 were JSON with `meaning`, `explanation` and `sense`; one `sense` was out of range (most-that-fits). Not judged for quality yet.
- Excluded: one 10-line prompt took 293 s while the tab was hidden behind another tab; it went on when the tab was shown again. Prompts in a hidden tab can stall.
- `create()` with the instructions: 0.65 s per fresh session. The first such session after the model had been idle about 50 minutes took 9.3 s (the base session of the tuning batch). A browser restart was not tried.
- `clone()` of a base session holding the instructions took under 2 ms, against 0.65 s for a fresh session, and the prompts after it are as fast: the same 30 terms (`batches/c2-clone`, content script) took 1,600 / 1,855 ms (p50 / p90) with only the sentence and 2,668 / 3,363 ms with 10 lines; paired with the fresh sessions the prompt time differs by −19 and −3 ms at the median. `create()` + `prompt()` together go from 2.3 s to 1.6 s (sentence) and 3.3 s to 2.7 s (10 lines). The base session's own `create()` took 7.5–9.3 s after the model had been idle about an hour, about 1 s otherwise.
- The offscreen document runs prompts at the same speed as a content script (C3: 2.3 s p50 over 1,391 prompts) and keeps going while no Lingo tab is shown. A content-script run stopped once: one prompt did not return for over 5 minutes while its tab was in front (whether the tab had been hidden before is not known). It was abandoned by reloading the tab; the probe now aborts a prompt after 60 s, and no prompt hit that limit afterwards. The spec's 30 s limit with "Couldn't explain this." covers this case.
- Tuning batch (24 other terms, sentence only and 10 lines, before the instruction "never in Chinese …" was added): 2 of 48 answers mixed in another language (Chinese, Thai), 2 failed with `QuotaExceededError: The input is too large.` because the corpus had a 38,000-character ASR card (an old build's cards; the prototype now cuts a card over 300 characters to its sentence).

## C3. Quality on real content
Method (the `real-content-quality` skill):
- Terms: the 300 of the 2026-11 Nano sense study's sample with two or more dictionary meanings (YouTube 120, articles 100, Netflix 80; New words, seed 20261115), each with that study's judged fit set (which of its EJDict meanings fit the sentence). Netflix was held out: the prompt was tuned only on 24 other terms (`proto/dev.jsonl`) and frozen before any C3 prompt ran.
- Conditions: only the sentence (`L0`), 5 lines (`L5`), 20 lines (`Lcap`, the tested cap: about 550 tokens at the median, p90 prompt time 3.9 s), each on videos also with the site's Japanese translation of every line (`T`; skipped when no line has one). 1,415 prompts (2 failed, below), `clone()` of a base session per batch, one at a time.
- Judged blind by 10 subagents, one packet of 30–40 terms each: the sentence with the term marked, five lines before and after, and every answer for the term in random order under letters, plus the control: what the hover shows first today (the first EJDict line for the term's chosen sense). Each answer: meaning good / acceptable / wrong / misleading, explanation ok / wrong / poor. `sense` was scored against the earlier study's fit sets (no judge).
- Terms without an entry: 60 expressions the 2026-11 judges said learners needed that today's build neither detects nor has an entry for (20 per site), each at the three context sizes (videos with the translation); control: today's literal Translator API translation of the expression.

Results (meaning "fits" = good or acceptable; rates in %):

| Site | Answer | Fits | Good | Wrong + misleading | `sense` fits | Explanation ok | Input tokens p50 | Prompt p50 / p90 (ms) |
|---|---|---|---|---|---|---|---|---|
| All (300) | today's hover line | 60 | 30 | 40 | 60 | – | – | – |
| | sentence only | 89 | 52 | 11 | 78 | 55 | 118 | 1,762 / 2,104 |
| | 5 lines | 88 | 49 | 12 | 76 | 56 | 263 | 2,150 / 2,747 |
| | 20 lines | 89 | 51 | 11 | 75 | 59 | 559 | 2,962 / 3,862 |
| YouTube (120) | today | 61 | 30 | 39 | 61 | – | | |
| | sentence / 5 / 20 lines | 86 / 84 / 87 | 58 / 51 / 55 | | 74 / 74 / 72 | | | |
| | the same with translation (95) | 94 / 91 / 95 | 64 / 62 / 52 | | 76 / 77 / 76 | | | |
| Articles (100) | today | 60 | 30 | 40 | 61 | – | | |
| | sentence / 5 / 20 lines | 93 / 94 / 92 | 55 / 55 / 51 | | 82 / 75 / 78 | | | |
| Netflix (80, held out) | today | 59 | 30 | 41 | 58 | – | | |
| | sentence / 5 / 20 lines | 88 / 88 / 89 | 39 / 39 / 45 | | 79 / 81 / 75 | | | |
| | the same with translation (70–80) | 84 / 90 / 89 | 40 / 48 / 41 | | 80 / 78 / 78 | | | |
| No entry (60) | today's literal translation | 65 | 32 | 35 | – | – | | |
| | the model, all conditions | 83–95 (90 pooled) | 40–65 | | – | 35–80 | | |

- **Context helps the meaning line a lot**: 60% → 88–89% fits on all three sites, the held-out Netflix included (59% → 88%). Half of the model's answers are "good" (readable at a glance and right) against 30% for today's first line. The JSON was valid in all 1,593 answers (no-entry included) and every `meaning` kept to 25 characters.
- **More lines do not help**: the sentence alone is as good as 5 or 20 lines on every site (differences within ±4 points, one judge per answer), and costs the least time.
- **The site translation does not clearly help**: paired on the same terms, YouTube gains 3, 0 and 5 answers and Netflix −2, +2 and 0 (out of 70–95); noise.
- **`sense` improves less**: 75–78% against 60% for today's chosen sense, close to the 72% the model reached without context in the earlier study. One in four "Fits here" marks would point at a wrong meaning.
- **Explanations are weak**: 55–59% ok, 17–21% say something false about the term (12–15% of all answers have a right meaning and a wrong explanation, e.g. "to" called a particle of purpose, "you" said to include the speaker), the rest unnatural or only restating the sentence.
- **Terms without an entry**: the model's meaning fits 90% (pooled, 180 answers) against 65% for the literal translation, which fails on idioms ("save scum" → クズを保存します). Only 20 terms per site.
- Baselines: the plan quoted 70% (dictionary rules) and 72% (the model without context) from the earlier study. On that study's own fit sets, today's chosen sense fits 60% of all 360 sample terms, the same as this control, so the 70% was a different measure. Compare within this table.
- Overflow: two 20-line prompts of one YouTube video failed with `QuotaExceededError` (a line of several thousand characters in an old build's cards); a line count needs a token check too.

## C4. Prompts per native language
The same prompt with the instructions in English and the answer asked in the native language; 30 terms each, judged blind on the same rubric (meaning, explanation, language).

| Pair | Terms | Fits | Good | Explanation ok | `meaning` within 40 characters | Prompt p50 |
|---|---|---|---|---|---|---|
| en→es (Spanish answers) | 15 YouTube + 15 articles of the C3 sample, en-es pack senses, 20 lines | 97 | 53 | 63 | 30 of 30 | 2.9 s |
| es→en (English answers) | 30 New words with two or more senses from 4 Spanish Wikipedia articles, es-en pack senses, 20 lines | 90 | 63 | 83 | 30 of 30 | 3.7 s |
| en→pt | – | `unavailable` (C1) | | | | |

- Every answer was in the asked language; the judges noted no mixed language. `sense` was not scored for these pairs (no judged fit sets).
- Portuguese stays `unavailable` until Chrome supports it (the spec's behaviour for an unsupported pair).

## The explanation only when needed (after the gate)
The user asked for an explanation only when the meaning line is not enough and the model is sure. Telling Nano to leave `explanation` empty "in most answers" did nothing (24 of 24 tuning terms still had one, with `""` and with `null`). A separate field before it did: `unusual: boolean` ("true only when the term is used here in a way the meaning line alone does not make clear: an idiom, slang, a figurative or unusual sense"), then `explanation: string | null`, with one example of each. Tuned on the 24 tuning terms, then run once on the 300 (5 lines, no translation) and judged blind against the earlier 5-line answers, the explanation shown only when `unusual` is true:

| | Always explained | Explained when `unusual` |
|---|---|---|
| Meaning fits (good) | 88 (45) | 85 (48); YouTube 87, articles 91, Netflix 76 |
| `sense` fits | 76 | 73 |
| Cards with an explanation | 100 | 53 |
| Explanations shown that are wrong | 21 | 26 |
| Cards with a wrong explanation | 21 | 14 |
| Right meaning, wrong explanation | 14 | 7 |
| Prompt p50 / p90 (ms) | 2,150 / 2,747 | 1,908 / 2,286 |

The gate halves the explanations a learner sees and the wrong ones with them, but does not make the remaining ones more accurate: the model cannot tell when it is sure. Meaning and `sense` are 3–4 points lower, within the noise of one judge per answer (Netflix −5).

## Decisions (gate, 2026-11-16)
The user decided:
- **Build it** (M2–M3, the automatic start for terms without an entry included): context lifts the meaning from 60% to 88–89%, on the held-out site too (the plan's threshold, ≥ 85% and ≥ 10 points over 72%, is met when "fits" counts acceptable answers; "good" alone is 39–58%). Without an entry, 90% against 65% for the literal translation.
- **Context: the sentence and a few lines around it**, a fixed number (5), not the budget loop; more lines add time and no quality. The token check stays as a guard (a line can be very long).
- **No site translation in the prompt** (it did not clearly help).
- **"Fits here" stays**, right three times in four.
- **The explanation only when needed**: the `unusual` gate above, shown as in the mock when present; the card has the meaning alone otherwise.

Also from the results:
- Where prompts run: the content script works (C1); the offscreen document is as fast and does not depend on the tab being shown, but cannot start a download. The spec's content-script design stands.
- One base session per page with `clone()` per term saves 0.65 s per prompt.
