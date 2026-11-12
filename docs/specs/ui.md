# UI spec (follows the mock)

The [UI mock](https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS) is canonical: when it and this file disagree, the mock wins, and this file is updated to match. Artboards: `YouTube — extension ON`, `YouTube — comments`, `Web article — highlights and phrase saving`, `Opening Lingo from the browser toolbar`, `Settings page`, `Word list page`, `Phase 2 — …` (words in this video, fullscreen, past occurrences), `LanguageData`.

## Shared: highlights
- Categories and looks: **Learning** = pale green background + green underline, **New** = pale blue background + blue underline, **Known** = gray underline
- Each category can be turned on/off; **by default only Learning is on**
- When subtitles are drawn over the video, the same category colors are brightened so they read on dark backgrounds
- Inflected forms are matched to the base form (ferments → ferment, loaves → loaf)

## Shared: theme
- Settings → Appearance → Theme: **System** (default; follows the browser's light or dark mode through `prefers-color-scheme`) / Light / Dark
- Applies to everything Lingo draws: toolbar popup, settings page, word list, and the on-page UI (hover card, also over a selection, dictionary window and panel, video panel and transcript, the ^ menu, the below-video subtitle box)
- Not themed: subtitles drawn over the video and the L / ^ player buttons (already for a dark video), and the highlights painted into a website's own text (the page keeps its own colors)
- The light palette is the mock. The dark palette (`src/ui/theme.ts`; the UI reads every color as a CSS variable with the light value as fallback):

| Token | Light | Dark | Used for |
|---|---|---|---|
| surface | #F6F7F9 | #12151F | page background, transcript cards |
| card | #FFFFFF | #1A1E2A | popup, cards, windows, panels |
| raised | #FFFFFF | #3A4053 | the selected option of a segmented control |
| surfaceGray / soft | #F1F2F5 / #EEF0F3 | #232838 / #262B3B | groups, chips, hover, row lines |
| line / lineStrong | #E3E5EA / #D5D8E0 | #2E3344 / #3D4357 | borders |
| ink / ink2 / ink3 | #14182B / #2A2F45 / #3A4056 | #E8EAF0 / #CDD1DC / #B4B9C7 | text |
| muted / faint | #5A6075 / #4E5468 | #9AA0B0 / #B0B5C3 | secondary text, translations |
| green (fills) | #0B8A6C | #0B8A6C | badge, buttons, switches |
| greenText / greenDark | #0B7F65 / #075C49 | #3CC9A3 / #6FE3C3 | green text |
| greenPale / greenLine | #E6F6F0 / #8FD3BC | #133A30 / #2A7A63 | Learning tiles, now-playing card |
| Learning highlight | #D3F1E5 + #0F9F7E | rgba(15,159,126,0.32) + #3CC9A3 | Lingo's own panels |
| New highlight | #EAF0FD + #2F6FE4 | rgba(47,111,228,0.32) + #7FA6F5 | Lingo's own panels |
| danger | #B42318 | #F97066 | errors |

## Shared: hover card
- Kind (Word / Phrase) and current status. Shown for every word in the vocabulary, also those known by their frequency (within the known level, not saved): they show as **Known**, with "Known" pressed; pressing it saves them as Known, "+ Learning" as Learning
- Headword, **IPA (always shown when available)**, short translation, extra notes (etymology, related words, pronunciation notes)
- Buttons: "+ Learning", "Known"; on articles also "Details", which opens the dictionary window (a click on a word inside a link follows the link, so this is the way in there). Over video the card ends with "Click the word for details" instead
- Phrases: saved phrases and dictionary phrases (Wiktionary idioms, phrasal verbs and prepositional phrases made of vocabulary words, plus EJDict's multi-word headwords) are matched by their words' base forms; the longest match wins and a saved phrase wins over a detected one. An unsaved detected phrase is New (the known level does not apply to phrases) and does not cover a word saved as Learning. Kaikki phrases starting with be/have/do, word sequences Wiktionary marks as non-constituents, idioms/phrases made only of very common words, and two-word Wiktionary phrases of two top-1000 words that do not end in an adverb particle ("come to", "live in", "very well"; "give up" stays) are left out of automatic highlighting; they still match when selected or saved
- Phrase patterns ([architecture](architecture.md) "Phrase patterns"): a pattern is a sequence of words and slots (`one's`, `someone`, `something`, `oneself` in English) with flags `detect` (used for automatic highlighting) and `gap` (words may come between its parts, as in phrasal verbs: "figure it out" → `figure out`). A pattern's word matches a token's written form or any of its base forms ("spilled the beans" → `spill the beans`). Automatic highlighting stays strict (contiguous `detect` patterns without slots, the filters above); saved phrases also match with slots and gaps. A phrase with a gap is drawn in parts, and the words in the gap keep their own highlights
- Phrase meanings: EJDict → Wiktionary's Japanese translations → Wiktionary's English definition (marked `lang="en"`). An English definition is translated on the device by the browser's translator when it shows (the definition, not the phrase: "To reveal a secret." rather than "spill the beans"), marked "Machine translation"; without a translator the English definition shows as it is. A selection that matches no pattern gets a literal translation from the browser's translator, marked the same way; if that is unavailable too, or does not answer within 1.5 s (its model may still be downloading), the translation line is left out

## Shared: dictionary window (opens when a word is clicked)
- **A popup window floating over the page.** It can be dragged by its handle and closed with ×, Escape, or a press anywhere outside it (a press on another word switches the window to that word instead; a press on the hover card keeps it). It is not a fixed column
  - Video: a window over the right part of the video, its right edge just past the transcript's left edge (at the video's right edge without a transcript), so it covers almost none of the transcript; when subtitles are inside the video, placed so it does not cover them
  - Article: a panel floating on the right side of the screen
- Contents
  - Headword, kind, pronunciation playback (`speechSynthesis`), **IPA**, notes, short translation
  - Status buttons: Learning / Known / Remove ("Not saved" when unsaved)
  - Meanings by part of speech. English definitions are translated on the device (up to four) and marked "Machine translation"; senses from Wiktionary's translation tables show the English sense as a hint before the native words
  - External dictionary links: Cambridge / Wiktionary / Reverso / WordReference (each can be turned on/off in settings; **users cannot add their own dictionary URLs**)
  - "In this video" / "On this page": other occurrences in the same video or page (with timestamps for videos; clicking seeks there). In a video's list the term is marked in each line with its category's highlight (as in the transcript, shown even when that category's highlight is switched off; each part of a phrase with a gap). On a page the list has every sentence with the term, the clicked one included, as in the mock; clicking one scrolls to it
  - "Seen elsewhere": occurrences in other sources. For unsaved words, explain that saving starts recording
- **No "Ask AI" button (links to ChatGPT / Claude) in phase 1**

## Video UI (YouTube / Netflix)
- **Two columns**: video on the left, transcript (subtitle cards) on the right. The dictionary is the popup window above
- **Transcript sidebar** (mock `Netflix — transcript beside the video` and `Fullscreen`, 2026-11-13): where the player fills the window or the screen (Netflix in the window and in fullscreen, YouTube in fullscreen) the player gets narrower and the column sits to its right as a sidebar: 360 px wide, 16 px from the top, right and bottom edges, 1 px border, 12 px corners. The player takes the rest (window − 360 − 2 × 16), the video letterboxed in it; the site's control bar and back arrow shrink with it. Nothing of Lingo's covers the video. The dictionary window opens over the player with its right edge at the sidebar's left edge, 72 px from the top, 360 × 420, with the darker shadow. The sidebar is not there while Lingo is off, for a video without subtitles, or while the column is closed: the player then has the whole width. Where the site's player cannot be narrowed (a page Lingo does not recognize), there is no sidebar
- **Closing the column**: × "Close transcript" at the top right of the column header (after the Transcript / Words tabs), on every page that has the column, closes the whole column (both tabs). The menu's "Show transcript in sidebar" switch brings it back. Both are one saved setting (on by default) for every page (YouTube watch page, Netflix, fullscreen), in the menu only, not on the settings page. On a YouTube watch page with the column closed, YouTube's own right column (recommended videos) shows
- **Subtitle position is selectable**: "In video" (overlaid on the video, default) / "Below video" (a large box under the video)
- **Translation visibility is set separately for the subtitle and the transcript** (both shown by default)
- **Prefer translations provided by the site** (order in [architecture](architecture.md) "Choosing a translation"). Where a translation came from is not shown
- **Two buttons in the player bar**, grouped in **one green outline** so they are not confused with YouTube's own gear
  - **L button**: one click turns Lingo on/off (when off: dotted outline + strikethrough). The state is remembered per platform (YouTube, Netflix): the next video there starts the same way
  - **Up arrow (^) button**: opens the Lingo menu (the ^ button itself has no gear icon). From the top:
    - Header: L, Lingo, current state (On / Off for this video), and a gear at the right that opens the settings page ("Open settings")
    - "Show transcript in sidebar" (switch): the column beside the video (see "Closing the column")
    - "Text size": a slider for the subtitle's and its translation's text size, 50–200% in steps of 10 (default 100%), in every subtitle position and in fullscreen
    - "Background": a slider for how dark the box behind the subtitle and translation over the video is, 0–100% in steps of 5 (default 80%; the translation's box is 0.9 of that). The light box below the video keeps its look
    - "Show dual subtitles" (switch): the subtitle's translation under it
    - "Subtitle position" as a label (14 px, sentence case, like "Text size") on its own line, with the In video / Below video choice under it at full width, the last row: an outlined box (1 px border, 8 px corners), 14 px text, the chosen option filled with the green accent and white text
    - The sliders show their value on the subtitle while dragged and are saved when let go
- Transcript
  - Each card shows the original with the translation below it. The playing card is emphasized and auto-scrolled; clicking a card seeks there
  - Words in a card work as in the subtitle: hovering one shows its hover card, clicking it opens the dictionary window (no seek). The card goes when the list scrolls, and while it shows the playing card does not scroll the list
  - Each card is a **sentence**: subtitle cues that do not end a sentence (. ? ! … ♪, maybe before a closing quote) are joined with the next cue when it starts less than 1.5 s later, up to 3 cues and about 25 words. Sound labels ("[MUSIC]") stay alone; a cue starting with a speaker's dash ("- …") starts a card, and a cue with two speakers' lines ends one. The subtitle in the video still shows one cue at a time
  - Auto-generated (ASR) tracks come as rolling fragments with word timings, often without punctuation. With YouTube's auto-translation, the cards follow its sentences: YouTube translates whole sentences and spreads them over the fragments, so each sentence end in the translation (。！？, or . ! ? before a space; not inside brackets) marks the nearest likely boundary in the original (a sentence end, a speaker change ">>", a comma, a pause, or an English sentence starter such as "so" or "I"), and each card gets exactly the translated sentences between its ends. Without it, a sentence ends at . ? !, sound labels and ">>", plus pauses of 0.8 s in tracks without punctuation, up to 20 words (40 in punctuated tracks). In the video an ASR card shows as lines of at most 60 characters (30 for languages written without spaces), split where the halves balance best, preferring pauses and punctuation; the card's whole translation stays under each line
  - Header: "Highlight" category toggles and the transcript translation switch
  - **While the language's data is missing** (mock `LanguageData`): one line at the top of the column, "Downloading Spanish data · 45%" over a bar, or "Couldn't download Spanish data" with Retry. The cards show without highlights and are classified once the data is there; the line then goes
- **Selecting words** (2026-11-13): selecting 2–8 words in the subtitle (in every position, in fullscreen and over a Short) or in a transcript card's original works as on articles ("Article UI" below): the selection snaps to whole words and shows the same card with "Selected · not saved", over the selected words. Over video this card also has "Details" (a selection cannot be clicked), which opens the dictionary window for the phrase. "+ Learning" / "Known" save the phrase; the card and the selection then go and the phrase is highlighted. A selection stays within one subtitle line or one card
- **Pausing while Lingo is in use** (2026-11-13): the video pauses when a selection starts in the subtitle or the transcript, when a word's hover card shows, and while the dictionary window is open. When the last of these closes, the video plays again, only if Lingo paused it and the user did not press play or pause in the meantime
- No instructions text under the video
- **When the video ends**, nothing is shown; unsaved New words are handled as Settings say (see "Unsaved New words at the end" below)

## YouTube comments (mock `YouTube — comments`, 2026-11-12)
- On watch pages, the comments and replies under the video (`ytd-comments#comments`) work like an article: highlights, the article hover card (with Details), selecting 2–8 words to save a phrase, and the dictionary panel 16px in from the window's top right. Only comment text counts: names, times, buttons, the header and the comment box get nothing
- Each comment's language is detected on its own (`<html lang>` is YouTube's interface language): a comment the detector reliably says is in another language is left alone; one it cannot decide on counts as the learning language. A comment YouTube translates is checked again
- Records are kept as on articles: a word saved from a comment keeps the comment's sentence, saved words seen in comments add occurrences, and comment sentences go into the sentence history. The source is the video (`platform` youtube, its watch URL and title) with the sentence as the position, so "Seen elsewhere" reads "YouTube · Nov 12" and links to the video. The Words tab, the popup's "This video" and the end-of-video save count subtitles only
- Only one dictionary is open at a time: opening the comments panel closes the video's window, and opening the video's window closes the panel
- Follows Settings → Sites → "YouTube comments" (on by default; needs YouTube on) and the popup's "On this site", not the player's L button. It covers Shorts' comments too (below)

## YouTube Shorts (mock `YouTube Shorts — subtitles` and `— comments`, 2026-11-13)
- Shorts (`/shorts/<id>`) get the subtitle only: Lingo's subtitle and its translation over the vertical video, above the Short's channel and title, with the hover card and the dictionary window as on a watch page. No transcript and no "Below video": the ^ menu is Text size, Background and Show dual subtitles (no transcript switch, no "Subtitle position"), and the settings stay as they are for watch pages
- The subtitle is a little smaller than on a watch page (20 px and 15 px for the translation at 100%); "Text size" and "Background" apply as usual
- The L and ^ group sits in the Short's own controls at the top of the video, before the captions button; the menu opens downward
- The dictionary window opens beside the video, right of YouTube's like / comments buttons, so it covers none of the video (over the comments panel when that is open)
- Moving to the next or previous Short loads its subtitles. A Short loops instead of ending: its first loop counts as the end for "Unsaved New words at the end"
- The comments panel (opened with the comments button) works like the comments under a watch video (above). Its dictionary panel opens just left of the comments panel, over the video, so the comments stay readable. The panel stays open when moving to the next Short, and Lingo starts over on the new comments
- Records: the source is the video's watch URL (`watch?v=<id>`) and the Short's title

## Article UI (content script)
- Detect the page language (`<html lang>` → `i18n.detectLanguage`) and run only when it matches the learning language
- While the language's data is missing (downloaded packs), the page shows nothing; it is analyzed once the data is there (the popup and Settings show the download)
- Color by category with the **CSS Custom Highlight API** (no DOM rewriting). `::highlight()` cannot draw padding, rounded corners or box shadows, so the mock's bottom bar is drawn as a 2px underline and the Learning background covers only the text height — the closest the API allows. Process only the visible range, progressively, and follow page changes with a MutationObserver
  - In browsers where highlights cannot be underlined, use background colors only (see [architecture](architecture.md) "Browser differences")
  - The text of a word with a background (New, Learning) is drawn in the mock's ink (`#14182B`): the backgrounds are light, and a dark page's white text (YouTube's dark theme) would vanish on them
- Find the hovered word with `caretPositionFromPoint`
- When 2–8 words are selected, snap the range to word boundaries and show the same card as a hovered phrase, where that card would sit, with the status "Selected · not saved" (mock PhraseMeaning): it names the phrase pattern the selection matched (the pattern covering the most selected words; the sentence decides when the selection is part of a longer pattern) with its IPA, short meaning and main word, and saving uses the pattern's key ("made up her mind" is saved as `make up one's mind`). A selection that matches no pattern shows the selected words with their literal translation and the "Machine translation" mark. "+ Learning" / "Known" save the phrase; the card and the selection then go and the phrase is highlighted. "Details" opens the dictionary panel for the phrase ("Not saved" until saved from there). Hover cards do not show while the selection card does. Phrases saved earlier keep their keys
- No card sits on the page (highlight toggles live in the toolbar popup). The dictionary panel sits 16px in from the viewport's top right (the mock's 84px makes room for its own page header)
- The clicked word gets the mock's green outline (drawn by Lingo's UI over the page, since `::highlight()` cannot draw outlines)
- **Only the title and body** (Settings → Articles → "Highlight only the article", on by default): the main content gets highlights, the end-of-article save (below), the sentence history and "Seen elsewhere" encounters. Menus, sidebars, footers and links to other stories get none of these, but hovering or clicking a word there works as anywhere. Switched off, the whole page counts
  - The body's container: paragraphs of prose (not list items, table cells, headings or captions; at least 25 characters outside links, less than half link text) score their parent fully, grandparent by 1/2 and great-grandparent by 1/3; the best-scored element, widened to its nearest `article`, `main` or `[role=main]`
  - Left out inside it: `nav`, `aside`, `footer` and their ARIA roles; elements whose class or id names related stories, sharing, comments, newsletters, promos, ads, references, footnotes and the like (unless they hold the best-scored element, so a wrapper class does not drop the body); blocks with 60% or more of their text in links ("Read more: …", "See also" lists)
  - The title: the container's first `h1`, else an `h1` whose text the page's `<title>` contains, even when it sits outside the container
  - When nothing reads as prose, the whole page counts
- **When the reader scrolls to the end of the article** (the last block of the main content above), nothing is shown; unsaved New words are handled as Settings say (below)

## Unsaved New words at the end (no UI on the page)
- Target: New words on the page/video that are **not saved yet** (saved words keep their status; words within the frequency level are not New). On an article, the analyzed part of the main content (what came near the viewport; the whole page when "Highlight only the article" is off); on a video, every cue
- When: once per page view / video, when the video plays to its end (not during an ad) or the end of the article comes into view
- Settings → Highlighting → "New words you didn't save": **Keep as New** (default; nothing happens, they show as New next time) or **Mark as Known** (they are saved as Known at once, silently, as `bulk` terms)

## Toolbar popup (click the extension icon)
- Toolbar icon: the green rounded square with a white "L" (`#0B8A6C`, as in the mock), 16/32/48/128 px, drawn from `scripts/icons/icon.svg`
- Header: Lingo, language pair (English → Japanese), then at the right a word list button (a list icon, "Word list") and a gear for settings (the same gear as in the player menu)
- **While the chosen pair's data is downloading or failed** (mock `LanguageData`): one line under the header, "Downloading Spanish data · 45%" over a bar, or "Couldn't download Spanish data" with Retry. None once the data can be used (an older version in use while an update downloads counts)
- "On this site": on/off for this site
- "Highlight": category toggles
- Word counts: Learning / Known / Phrases
- "This page" ("This video" on a video site): save every unsaved word at once
  - Target: New words on the page/video that are **not saved yet** (the same words as "Unsaved New words at the end"; saved words keep their status, words within the frequency level are not New). The line beside the heading says how many ("46 words not saved yet", "Every word is saved")
  - Actions: "Mark all as Learning", "Mark all as Known" (hidden when nothing is unsaved). Afterwards show the count ("46 words marked as Learning") and **Undo**
  - The explanation is not shown by default; **only when the (i) button is pressed**
  - Only in the popup: nothing appears on the page itself
- Sync status: last saved time and usage (e.g. "Saved to Chrome sync · 2 min ago", "41 KB of 100 KB used")
  - The extension cannot tell whether data reached other devices, so it never says "synced"
  - The "Chrome sync" part follows the browser ("Firefox Sync" in Firefox)
  - Before the first save: "Not saved yet". With sync off: "Sync is off", without the usage bar
- "On this site" and "This page" are hidden on pages where no content script answers (browser pages, the store). The host comes from the content script, so the popup needs no `tabs` permission

## Settings page (the extension's options page, opens in a new tab)
- Three ways to open it: ① the gear in the toolbar popup, ② right-click the extension icon → "Options", ③ chrome://extensions → Lingo "Details" → "Extension options" (Firefox: about:addons → Lingo → "Options"; the wording follows the browser). Also from the gear in the menu next to L in the video player bar
- Sections
  - **Languages**: learning language, native language, interface language (English only for now). The choices list only the pairs the lock file offers (those passing the quality gate)
    - **Language data** (mock `LanguageData`): "Words and dictionaries Lingo keeps on this device." Nested under it:
      - the chosen pair ("Spanish → English"), when its data is downloaded rather than bundled: its size ("6.4 MB") and "Downloaded" with a check, "Downloading · 45%" with a bar, or "Couldn't download" (red) with Retry
      - downloaded data the chosen pair does not use, grouped by the pair it belongs to ("English → Korean", "Not used by your languages now · 9.1 MB") with Remove, which deletes that data and its cached translations
    - The row shows when the chosen pair's data is downloaded rather than bundled, or when other downloaded data is on the device; a bundled pair with nothing else downloaded has none
  - **Appearance**: Theme — System (default) / Light / Dark, a three-option segmented choice (see "Shared: theme")
  - **New-word level**: slider "Treat the N most common words as known" (1,000–20,000, default 3,000)
  - **Highlighting**: on/off per category, "New words you didn't save": Keep as New (default) / Mark as Known, a two-option segmented choice
  - **Dictionaries and AI**: on/off for the four external dictionaries. "AI explanations inside the window" shows Coming later (the mention of "Chrome's built-in AI" is hidden in browsers without built-in AI, leaving only "your own API key")
  - **Video subtitles**: subtitle position (In video / Below video), subtitle translation, transcript translation
  - **Sites**: on/off for YouTube / YouTube comments / Netflix / other articles, and a "Never run on" list
  - **Sentence history**: see "Past occurrences of unsaved words"
  - **Sync and backup**
    - Browser sync switch ("Sync word status with Chrome sync"; the name follows the browser). The description explains that data reaches other devices when the user is signed in to the browser with sync on
    - Usage and last saved time ("Last saved …", never "Last synced")
    - JSON Export / Import. The description shows **when the last export happened** ("Last export: …", "Never exported."). Export downloads `lingo-backup-YYYY-MM-DD.json`; Import reads a chosen file and says "Imported N words" (or why it failed)
    - "Your own cloud storage" shows Coming later
  - **Articles**: "Highlight only the article" (on by default; see "Article UI")
  - **About**: version, data license notices

## Word list page (a page inside the extension; mock `Word list page`, approved 2026-11-10)
- Opens in a new tab from the word list button in the toolbar popup's header
- Header: Lingo, "Word list", language pair, **Export / Import** (the same JSON as in Settings)
- Filters: search (words and meanings), status (All / Learning / Known), kind (All / Words / Phrases), sort (Recently seen / A–Z / Most seen)
- List columns: Word (with a Phrase tag), Meaning, Status, Seen (number of occurrences), Last seen
- Selecting a row shows a details panel on the right: headword, kind, pronunciation playback, IPA, short translation, status buttons (Learning / Known / Remove), and "Where you saw it · N" (each occurrence with its source, time or date, the sentence, and a link back to the spot; the occurrence where it was saved is marked "Saved here")
- Details decided while building (2026-11-10):
  - Search matches the base form and the short meaning, ignoring case and surrounding spaces. Words without a dictionary entry (phrasal verbs such as "figure out" are not in EJDict) show no meaning
  - Sorting: Recently seen = newest occurrence first (a word without occurrences counts from when it was saved); Most seen = most occurrences first, then recently seen; ties go A–Z
  - Last seen and the occurrence dates: "Today", "Nov 6" within this year, "Nov 6, 2025" before it. An occurrence's line reads site (or host) · "at m:ss" for video times · the date unless it is today · "Saved here"
  - The first row is selected when the page opens. Remove takes the word out of the list at once; its panel stays with "Not saved" pressed, and Learning / Known save it again from the occurrence it was saved from (its other occurrences are gone with the removal). A word removed without any occurrence cannot be saved again here
  - Export / Import are the settings page's buttons; the import result ("Imported N words" or the error) shows beside them and the list is read again. The list is also read again when the tab becomes visible
  - More than 500 words: only the rows in view are rendered
  - While the language's dictionary is not on the device (downloaded packs), the list shows without meanings and the details wait; both are read again once the data is there

## Words, fullscreen and past occurrences (mock, approved 2026-11-10)
- **Words in this video** (mock `Phase 2 — words in this video`): the right column gets two tabs, Transcript / Words. Words lists the words and phrases in the video in order of first appearance, each with its highlight, short translation and how many times it occurs (e.g. 3×). Filter chips All / New / Learning / Known with counts. Selecting a word opens the dictionary window with its "In this video" list
  - Listed: New (unsaved), Learning and saved Known words and phrases; words known only by the frequency level and ignored tokens are left out. Short meanings come from the dictionary and from definitions already translated on the device; a list never starts a new translation. The tab and filter are per video (Transcript and All by default). The Transcript tab keeps the Highlight chips and the Translation switch under the tabs. The column's accessible name is "Lingo"
- **Fullscreen** (mock `Phase 2 — fullscreen video`): in the player's fullscreen the subtitle and translation stay over the video (larger), hover cards and the dictionary window work, and the L button and ^ menu stay in the player bar. The transcript shows in the sidebar beside the narrowed player (see "Transcript sidebar" under Video UI) unless the column is closed. The subtitle position choice does not apply (always in the video), so the ^ menu has no "Subtitle position" row: Show dual subtitles is its last row
  - The site's captions stay hidden in fullscreen. The subtitle uses a larger look (34 px line, 24 px translation, 120 px above the bottom edge, or higher above Netflix's control bar). The dictionary window (360 × 420, darker shadow) opens with its right edge at the sidebar's left edge, 72 px from the top, as in the full-window sidebar layout; with the column closed, at the top right (32 px in). It is placed again when fullscreen starts or ends, or the sidebar opens or closes. Everything Lingo draws on the page moves into the fullscreen element while fullscreen lasts (its parent when that is a `<video>`)
- **Past occurrences of unsaved words** (mock `Phase 2 — past occurrences of unsaved words`)
  - The dictionary window shows "Seen elsewhere · N" for unsaved words too, from the local sentence history. When the word is saved, those occurrences become part of its history
  - Rows show "host · Nov 8" for pages and "YouTube · at 3:10 · Nov 8" for videos (saved words too)
  - Settings gets a **Sentence history** section (after Sites): "Keep sentence history" switch (on by default; never synced; Never run on sites are not kept), space used with a bar (cap 50 MB; the oldest pages are removed first), the number of pages and videos, and "Clear" (saved words and their sources stay)
