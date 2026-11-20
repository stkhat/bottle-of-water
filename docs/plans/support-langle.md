# Support Langle: feedback, rating, donations and a sponsor card

Mock approved by the user 2026-11-21 (`Toolbar`, `Settings`, `WordList` with its `sponsor` prop, `Main`, `Fullscreen`, `FullWindow`, `VideoWords`; canvas note `supportNotes`). Spec: [ui](../specs/ui.md) (Toolbar popup, Settings page, Word list page, Video UI), [architecture](../specs/architecture.md) "Chrome Web Store requirements" (Ads).

## What it is
- **Toolbar popup**: a "Support Langle" footer under the sync block, always shown: Rate (the store's review page) at the left, "Buy me a coffee if you enjoy Langle" (Ko-fi) at the right. Once Learning reaches 100 words, a one-time speech bubble asks for a rating, pointing at Rate; Rate or × answers it for good (`rateNudgeDone`, a synced setting). The same prompt for everyone
- **Settings**: a green Support Langle box in the left column under the section nav: Buy me a coffee, Rate Langle, Send feedback, Become a sponsor. No switch for the sponsor card (uninstalling removes it, which the store's Ads policy accepts)
- **Video column**: a footer with "Send feedback" under the transcript and the Words list (YouTube, fullscreen, Netflix)
- **Word list**: one card pinned under a word's details: a sponsor ("Sponsored", link with `utm_source=langle`), an affiliate link ("Ad" and the commission line), or, with nothing bundled (at launch), an invitation to sponsor the spot in the user's learning language
- No server, no network for any of it: URLs and card data ship in the release (`src/core/links.ts`, `src/core/sponsors.ts`, `public/sponsors/`). A link whose URL is empty is not shown, so the code merges before the accounts exist

## Progress
- [x] `rateNudgeDone` setting; `BrowserEnv.reviewUrl` (Chrome Web Store / AMO); `links.ts`; `sponsors.ts`
- [x] Popup footer and nudge (Nunito bundled from `@fontsource/nunito`, latin 600 and 800)
- [x] Settings → Support Langle box; the left column scrolls on its own in a short window
- [x] Video column footer (both tabs, both themes)
- [x] Word list sponsor spot (sponsor, affiliate, open)
- [x] Browser tests for each; screenshots compared with the mock in light and dark
- [x] Docs: ui.md, architecture.md (Ads), status.md "Before publishing"
- [ ] The user's accounts and pages (below), then their URLs in `links.ts` and `REVIEW_URLS`
- [ ] A first sponsor or affiliate card in `SPONSOR_CARD`, with its logo under `public/sponsors/`

## The user's tasks
- Create the Ko-fi page; put its URL in `KOFI_URL`
- Create the feedback Google Form (short); put its URL in `FEEDBACK_URL`
- Publish a sponsor page (audience: people learning a language on videos and articles; the slot's format: name, one line up to 80 characters, logo, link; contact); put its URL in `SPONSOR_PAGE_URL`
- After the first store upload, fill `REVIEW_URLS` (Chrome Web Store reviews page; AMO for Firefox)
- Store listing text: disclose the sponsor/affiliate card on the word list page and that Langle may earn a commission, before install
- Pick an affiliate program whose terms allow browser extensions (Amazon Associates does not)
