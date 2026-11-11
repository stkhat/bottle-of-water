# Translating English definitions with the browser's translator (M9b)

Measured on 2026-11-11 in the user's Chrome 157 (macOS) on a Wikipedia page. The Translator API ran in the page itself, en→ja. Sample: 100 senses from `public/packs/en-defs`, picked at random with a fixed seed, with leading labels removed. The pointer senses that the first cleaning rule knew about ("Alternative form of …") were left out.

## Speed
- **Model**: en→ja was `downloadable`. Subtitles on the user's videos had always used the site's translation, so the model had never been downloaded. `Translator.create` needed a click, and took 23 s while the model downloaded. This happens once per browser profile.
- **Per definition**, warm: median 3 ms, 90th percentile 7 ms, maximum 15 ms (the first one). Translating the same text again took 3 ms.
- **Conclusion**: latency doesn't matter for the hover card or the dictionary window, even sharing one queue with subtitles. What matters is the one-time model download, which needs a user activation. Hover cards therefore show the English until the model is there.

## Quality (en→ja, read by Claude)
Roughly 70 of the 100 read well, about 15 are awkward but understandable, and about 15 are wrong.

- **Good**: plain sentence-like definitions.
  - "To drink a beverage." → 飲み物を飲む。
  - "A pleasant or easy situation; an untroubled existence." → 楽しいまたは簡単な状況。 問題のない存在。
  - "To die; to be killed." comes out fine.
  - Semicolon-separated senses keep their parts.
- **Wrong, mostly "Synonym of X." senses (11 of 100)**: the referenced phrase is translated word for word ("Synonym of base on." → ベースの同義語). These are now pointers and are not translated. When a colon follows ("Synonym of X: to annoy someone."), only the part after the colon is translated. "American standard spelling of …" is a pointer too.
- **Wrong, fragments without a sentence**: short adjective lists translate badly ("prudish, straight-laced" → 無礼で、まっすぐなひも).
- **Awkward**:
  - Infinitives sometimes come out as purpose clauses ("To make someone feel in a better mood" → 誰かの気分を良くするために).
  - Jargon from sports and computing (poker, cricket) is garbled, but so is the English for most learners.
- **Vulgar entries**: they are translated literally, as Wiktionary defines them.

## Decisions taken from this
- "Synonym of" and "standard spelling of" are pointers in `cleanDefinition`. The part after a colon is kept.
- The English definition stays under every translated sense in the dictionary window, as the mock shows. This covers the awkward and wrong cases. The hover card shows only the translation, marked "Machine translation".
- No length limit is needed for speed. Very long definitions (over 200 characters) are rare and translate in under 15 ms.
