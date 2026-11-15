# Meaning in context: checks before building (phase 3 M0)

**Partial: M0 stopped on 2026-11-15.** Done: C1 (API surface in every context, pairs, activation, docs), C2 latency with fresh sessions (sentence only, 5, 10, 20 lines, most that fits; 30 YouTube terms) and a first look at `clone()`. Not done: C2 `clone()` batch on the same terms, the budget cap decision, C3 (quality, blind judging), C4 (prompts per native language). The study folder `data/raw/quality/2026-11-context/` (git-ignored) has the prototype, batches, results and a README on how to resume.

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
- `clone()` of a base session holding the instructions took under 2 ms (48 clones, tuning batch), against 0.65 s for a fresh session. The same 30 terms through `clone()` (`batches/c2-clone`) were not run, so whether prompts after `clone()` are as fast is not measured.
- Tuning batch (24 other terms, sentence only and 10 lines, before the instruction "never in Chinese …" was added): 2 of 48 answers mixed in another language (Chinese, Thai), 2 failed with `QuotaExceededError: The input is too large.` because the corpus had a 38,000-character ASR card (an old build's cards; the prototype now cuts a card over 300 characters to its sentence).

## Facts that bear on the plan's design questions
Nothing is decided here (M0 is not finished; the user decides at the gate).
- C1: content scripts have the API in top frames, and in iframes whose embedder allows `language-model`; an iframe without that permission gets `unavailable`.
- C1: en→pt is `unavailable` (any Portuguese); en→ja, es→en and en→es are available.
- C1: once the model is present, `create()` needs no user activation in any context; a content-script click handler in Lingo's shadow DOM has the activation a download asks for. An offscreen document has none.
- C1: `measureContextUsage` does not count the schema.
- C2: with fresh sessions, p90 stays under 5 s up to about 10 lines (3.8 s) and is 5.3 s at 20 lines; the most that fits (~8,500 tokens) takes about 19 s. Sentence-only prompts take 1.6 s (p50), well under 10 s.
