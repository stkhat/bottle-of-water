# M9b — English definitions translated at display time

> Executed with superpowers:subagent-driven-development. TDD: core helpers and the background in Node or Browser Mode (IndexedDB); UI in Vitest Browser Mode; the built extension with Playwright E2E. Design: [language data](../specs/2026-11-11-language-data-scaling-design.md) §5. Mock: artboards `PhraseMeaning` (hover card for "spill the beans") and `TranslatedSenses` (left window), reviewed 2026-11-11.

**Goal:** when a term's meaning exists only as an English definition (`glossLang: "en"`, the native language is not English), the UI translates the **definition** with the browser's translator. The hover card translates the short meaning. The dictionary window translates up to four senses and keeps the English under each one. Results are marked "Machine translation" and cached on the device. Today this covers the 13,294 phrases that have only an English definition for English → Japanese.

## Rules
- **What is translated**
  - The cleaned English definition, never the term itself.
  - Cleaning (`src/core/definitions.ts`, `cleanDefinition(text): string | undefined`) drops leading labels in parentheses ("(idiomatic, informal) To reveal a secret." → "To reveal a secret.").
  - Pointer senses ("Alternative form of …", "Misspelling of …", "Abbreviation of …", "Plural of …", "Past tense of …" and similar) return undefined: they are not translated and show as written.
- **Where it runs**
  - In the UI only: content scripts and extension pages. The background never translates.
  - `BrowserEnv.features.translator` is detected in the service worker, where `Translator` never exists. It is unused, so it is removed.
- **Queue**
  - Each content script has one queue (`src/content/translate/queue.ts`) over `createBuiltInTranslator`. It handles one request at a time, highest priority first:
    1. the playing subtitle line
    2. the dictionary window
    3. the hover card
  - Requests for the same text share one translation.
  - The video's `translateCue` and the term translator both go through it. The 1.5 s wait from M9a stays for the hover card.
- **Cache**
  - Dexie version 3 adds `mtCache: "key, usedAt, pair"`.
  - `key` is `${L}>${N}:${cleaned English text}`. The same English text always translates the same way, so the term key and sense index are not needed. `pair` is `${L}>${N}`.
  - At most 20,000 rows: after a write that goes over, the least recently used rows are deleted.
  - The cache is device only: it is not synced, and it is not exported.
  - `clearTranslations(pair)` is used by M9c when a pair's packs are removed.
- **Messages**
  - `lookup` adds `translations?: Record<string, string>`: the cached translations for this entry's cleaned short and senses, keyed by the cleaned English. Reading them touches `usedAt`.
  - New request `cacheTranslations { lang, items: { text, translated }[] }` → `null`. The native language comes from settings. It is repeatable.
  - `termSummaries` and `listTermsWithStats` use a cached translation of the short meaning when there is one (`glossLang` then dropped). They never start a translation.
- **Display (per the mock)**
  - Hover card: the translated short meaning with the "Machine translation" pill. This is the existing `machineTranslated` flag; `glossLang` is dropped since the text is now native.
  - Dictionary window:
    - The short line shows the translation without a pill.
    - The "Meanings" heading row gets the pill on its right when any sense is translated.
    - Each translated sense shows its translation in the native language, with the English definition below it in secondary text (`lang="en"`).
    - Untranslated senses (pointers, no translator, not yet arrived) show the English as today.
  - Without a translator (Firefox) everything stays English, as today.
- **Model download**
  - Creating a translator whose model must be downloaded needs a user activation. The dictionary window's click provides one.
  - Settings → Languages starts the en→N model (and L→N when L ≠ en) inside the change handler when the native or learning language is chosen.
  - Hover cards never start a download; they show the English until the model is there.

## Tasks
1. **Background** (`src/background/db.ts`, a new `src/background/translation-cache.ts`, `handlers.ts`, `src/messaging/{protocol,client}.ts`, `src/core/definitions.ts`, `src/core/browser-env.ts`)
   - Implement `cleanDefinition`, the Dexie version 3 store, the cache with its cap, `lookup.translations`, `cacheTranslations` and the summaries. Remove `BrowserEnv.features.translator`
   - Tests:
     - `cleanDefinition` cases
     - the cache in Browser Mode (IndexedDB): put, get, `usedAt` touched on read, cap eviction, `clearTranslations`
     - handler tests: `lookup` returns cached translations only for English-gloss entries when the native language is not English; `termSummaries` uses the cache
2. **UI** (`src/content/translate/queue.ts`, `describe.ts`, `article.ts`, `session.ts`, `src/ui/lookup/{HoverCard,DictionaryWindow}.tsx`, `ArticleUi.tsx`, `VideoUi.tsx`, `src/entrypoints/options/SettingsPage.tsx`)
   - The queue and its priorities
   - `describeTerm` translates the short meaning (cached first, then the queue at hover priority) and sends `cacheTranslations`
   - A `translateSenses(card)` step runs when the dictionary window opens: up to four senses, cached first, then the queue at window priority, then the window updates
   - Rendering per the mock, using theme tokens only. Settings starts the model download
   - Tests:
     - queue order and dedupe
     - hover card: translated short with the pill
     - window: pill on the Meanings heading, English under each translated sense, pointers untouched
     - no translator: English unchanged
     - the cache is used without calling the translator
     - the subtitle line goes first
   - Screenshots for the mock comparison
3. **Measure and record** (in the user's Chrome, Claude in Chrome)
   - Translate about 100 English definitions from `en-defs` (en→ja) with the Translator API in a page. Record how many read well, typical failures, and the time per definition, cold and warm, also while a video's subtitles are being translated. Write the results in `docs/notes/definition-translation.md`
   - Update `docs/status.md`: M9a merged, M9b state, open points

## Verification
- `npm run verify`, `npm run build:firefox`
- Render the hover card and the window and compare them with the mock
- In the check build in the user's Chrome:
  - hover a detected English-only phrase (e.g. "spill the beans") on an article: the card shows Japanese with the pill
  - open its window: senses are translated, with English below
  - reload: the translation comes from the cache with no delay
