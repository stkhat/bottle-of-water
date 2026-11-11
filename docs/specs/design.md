# Lingo — design

Spec files: this one (context, decisions, phases, risks), [ui.md](ui.md) (follows the mock) and [architecture.md](architecture.md).

## UI mock (canonical)
- **https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS** (Claude Design, private, owner only). **When the spec and the mock disagree, the mock wins**; [ui.md](ui.md) mirrors it
- Working name of the extension: **Lingo**

## Context
A browser extension (Chrome first) that turns the videos (YouTube / Netflix) and articles you already like into study material, right on the page. The video UI takes cues from Language Reactor ([notes](../notes/language-reactor.md)); article highlighting takes cues from Relingo.
Differentiators: highlights by category (New / Learning / Known), saving phrases, and recording each word's source and where it shows up again.
**Constraint:** the extension will be public, and **the developer runs no servers at all**. Data stays on the user's device and in the user's own browser sync (a Google account in Chrome, a Mozilla account in Firefox).
**Scope:** do not copy every LR feature; keep to the basics.
Development pair: learning language = English, native language = Japanese, sites = YouTube and Netflix. More language pairs and sites are added later by plugging in new parts.

## Decisions
- Build a generic multi-language structure from the start
- The role of a web app is undecided → start with **pages inside the extension** (word list, settings); a standalone site can come later
- **Both the text UI and the video UI, each minimal**
- Storage has **two layers**: IndexedDB (all data) + `storage.sync` (browser sync, status only) + JSON export
- **Target browsers**: the first release is Chrome only, but the code is browser-neutral from day one so Firefox, Edge and others can follow (see [architecture](architecture.md) "Browser differences")
- "New" is decided by **a frequency level (the top N words count as known) + saving a whole page at once**
- Every saved word **always has a source**, and you can see **whether a saved word appeared elsewhere**
- The UI is **English only** for now, built so it can be switched later
- Colors: **white background + dark navy text + green accent**, the same across video, article, popup and settings (Grammarly-like, but not identical). A dark theme follows the browser by default (see [ui.md](ui.md) "Shared: theme")

## Phases
1. **Phase 1 (MVP)** and **phase 2** — built: article and video UI (YouTube, Netflix), popup, settings, word list; phrase detection and patterns, sentence history, Words tab, fullscreen, Spanish → English, definitions translated at display time, downloadable packs, Spanish and Portuguese as native languages, YouTube comments. What is left is in [status.md](../status.md)
2. **Phase 3**
   - "Ask AI" button (links that open ChatGPT / Claude with a prompt containing the word and sentence)
   - LLM explanations: embed "word + sentence + nearby subtitles + saved words" in a prompt, receive JSON, cache per word + sentence. Run on Chrome's built-in Prompt API (Gemini Nano) first, with the user's own API key as a fallback
   - Example sentences from Tatoeba (CC BY)
   - Anki / CSV export
   - More sites
3. **Future**
   - Firefox version (alternative to highlight underlines, publishing on AMO), then Edge and others
   - Sync to the user's own cloud storage (Google Drive / Dropbox / OneDrive / local folder / WebDAV)
   - More interface languages and switching between them
   - A standalone web app (only if needed)

## Risks and open questions
- YouTube/Netflix UI or internals may change and break things → keep per-site code in separate parts and test subtitle parsing with fixtures
- No part-of-speech tagging, so dictionary lookups cannot be narrowed by part of speech (all parts of speech are shown)
- Some words have no IPA on Wiktionary (not shown)
- Translator / Prompt API are available only on desktop Chrome 138+. Firefox has neither
- Browser sync only stores locally when the user is not signed in, and the extension cannot reliably tell. JSON export is the only safeguard for users without sync
- Data licenses: Wiktionary-derived data is CC BY-SA, EJDict-hand is public domain (Tatoeba, phase 3, is CC BY). Downloaded packs are published under CC BY-SA with attribution; only public-domain, MIT or CC BY-SA sources are used
- Host availability: if both jsDelivr and unpkg are down, a pair not yet downloaded cannot be used; downloads retry with backoff. Hosts can be swapped by a release, since files are verified by hash
- The browser's translator is unreviewed and can differ between devices: its output is marked "Machine translation" and never counts toward the quality gate
- Netflix terms of use (stay within techniques equivalent to LR's)
- Fetching YouTube subtitles needs the token the player adds (`pot`, bound to the video); a plain fetch returns an empty body. Checked 2026-11-10 ([notes](../notes/youtube-captions.md)): once the player has made one timedtext request for the video, the extension can fetch the Japanese track and the auto-translation (`tlang`) by reusing that request's URL. If YouTube stops allowing this, ask the player for each track instead, or fall back to the built-in translator. Automated browsers (Playwright) get empty captions even from the player, so tests use recorded fixtures
