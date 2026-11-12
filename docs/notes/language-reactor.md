# Language Reactor field study (2026-11-08)

Reference only; Lingo follows its own mock. Checked in LR's web player (a YouTube video), which has the extension's UI.

**Layout (three columns)**
1. Left: the video, with the current subtitle (original) + translation large below it
2. Middle: list of subtitle cards (original and translation side by side, current one emphasized, "Text / Words" tabs)
3. Right: dictionary panel (a fixed column opened by clicking)

**Hover**: detects phrases automatically and shows them first (e.g. about → "know all about"), then the word's short translation, with Known / Learning buttons

**Dictionary panel**: search box, headword and short translation, pronunciation, frequency, status buttons (Known / Learning / Ignore), tags, translations by part of speech, external dictionary links (URL template `…/{q}`), "Example: current text"

**Back end (from network traffic). Everything runs on their own servers (dioco.io)**
- Subtitles: `getYoutubeSubsData` (server adds part of speech, base forms, dependencies)
- Subtitle translation: `getYoutubeSubsTranslations`
- Hover dictionary: `getHoverDictEntriesForSubs` (prefetched for the whole video)
- Full dictionary: `getFullDict?form=about&pos=ADP&sl=en&tl=ja` (translations by part of speech and Tatoeba examples)
- Text-to-speech: `getDictTTS`; external dictionary list: `getExternalDicts`

**Lexa AI (detailed explanations)**
- Requires sign-in. Prompt templates come from the server (`getLexaPrompts`). The server embeds the user's context (looked-up word, current video, saved words due for review) in the prompt and calls an LLM. The model is not disclosed
- The "GPT" button in the dictionary panel uses no server (confirmed in source). It just opens `https://chatgpt.com/?q=<prompt>` in a new window

**Replacements in this project (no own servers)**

| LR feature | This project |
|---|---|
| Server-side NLP (part of speech, base forms) | `Intl.Segmenter` + inflection → base form table |
| Subtitle translation | Chrome's built-in Translator API |
| Dictionary | bundled dictionary (EJDict-hand) + IPA from Wiktionary |
| Text-to-speech | Web Speech API `speechSynthesis` |
| External dictionaries | URL templates (fixed four) |

**Not adopted**: Aria (conversation AI), PhrasePump, FSI/DLI, video catalog, playback-speed controls, and its auto-pause at the end of each line (Lingo pauses only while one of its cards or a selection is open: [ui](../specs/ui.md) "Video UI")
