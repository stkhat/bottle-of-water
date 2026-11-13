---
name: real-content-quality
description: Measure and improve what Lingo shows on real content — hover meanings, phrase highlights, names, site and machine translations, alignment — by collecting real YouTube/Netflix/article text in the user's Chrome, running Lingo's own code over it offline, judging samples blind, fixing root causes with general rules layered by language part, shipping the fixes in steps, and checking them on the real sites. Use this whenever the user asks how good Lingo's translations, meanings or highlights are on real videos or articles, wants them improved or measured, wants a quality study for a new language pair or site, or says things like "実コンテンツで翻訳の質を調べて", "ホバーの意味が変", "熟語のハイライトを良くしたい", even if they don't name a method. Not for a single reported bug (debug that directly) or for adding a site adapter.
---

# Improving Lingo's output on real content

This is the loop used for the 2026-11 translation-quality work (`docs/notes/translation-quality.md` on branch `claude/translation-quality-testing-0cdf07`; PRs #53–#62). It goes: real corpus → offline runner → blind judging → root causes → prototype and blind A/B → report and user decisions → one PR per step → real-site check. Each phase exists because skipping it produced a wrong conclusion at least once; the reasons are given so you can adapt a phase rather than drop it.

Read the parts of the spec the work touches first (CLAUDE.md "Read first"). Chat with the user in Japanese; everything committed is in English.

## Ground rules

- **Real content, not fixtures.** Fixtures show what the code was written for. Real captions (ASR, ALL-CAPS, condensed Netflix cues, speaker dashes, `[sighs]`) and articles show what learners meet. Mix sites, genres, accents and caption kinds.
- **General rules only.** A fix is driven by grammar, the sources' own structure (labels, POS, pointers, translation tables) or statistics — never by a list of specific words or phrases. A rule that only works on the judged items is overfitting, and the fresh sample will show it.
- **Never tune on what you evaluate.** Tune on one sample, confirm on a fresh one, and keep one site as held-out (Netflix, last time): freeze the prototype before judging it.
- **Layer every rule** so another language pair knows what it must supply:
  - CORE: the language-independent mechanism.
  - LEARNING: per learning language, inside `LanguagePack` (tagger, closed classes, casing, names, phrase POS, example corpus).
  - NATIVE: per gloss language (pointer syntax, short-line cut rules, POS inferred from glosses).
  - PAIR: quirks of one dictionary source (EJDict merging case variants, …).
- **Precision before recall** for highlights, since a learner sees every highlight (user decision, 2026-11-13). Report density per 1,000 tokens next to usefulness.
- **Copyrighted text stays out of the repo.** Corpus, packets and judgements live in the study folder (`data/raw/quality/<study>/`, git-ignored; see Phase 2); PRs and notes quote only short snippets.
- **The user decides trade-offs** that change what the learner sees: density, number of senses, bundle size, how names look. Measure the options, then ask with AskUserQuestion; don't pick silently.

## Phase 1 — Collect a corpus in the user's Chrome

Use Claude in Chrome with the check build (`docs/development.md` "Checking in your own Chrome").

- Size: round 1 was ~50k tokens (10 videos, 5 episodes, 10 articles). Round 2 was 3× larger with different content: 30 videos in 14 genres, 30 articles from 10 outlets, 15 Netflix episodes from 5 shows (3 seeded-random episodes each).
- Write a `manifest.json`: kind, id, title, channel or show, genre, caption kind, has a human native-language track, has `tlang`, minutes, url.
- What to save per source, and how to get it from the page to disk: [references/collection.md](references/collection.md).
- Save the **raw timed tracks** (learning language, the site's native-language track, YouTube `tlang`), not only what Lingo rendered. Last time Netflix kept only rendered cards, so the alignment fix could not be measured offline afterwards; `netflix-grab.js` still saves only cards, so extend it first (collection.md).
- Choose the videos, shows and articles yourself; the user doesn't name them. Choose for variety in what they test (see collection.md).
- A site the grab scripts don't cover (a podcast page, another video site): write a grab in the same style that saves the raw text or tracks plus an `id`, and add the site to `build-units.ts`.
- Etiquette: don't choose a Netflix profile or change account or site settings. Leave cookie banners unanswered or decline them. If a site walls you (an ad-block notice), pick another article.
- When collection is done, remove every Netflix title you opened from the "Continue Watching" row (collection.md, "Clean up afterwards").
- End every Chrome session by reading and clearing the `lingo:check-errors` log.

## Phase 2 — Run Lingo's own code offline

The scripts in `scripts/` run a checkout's own code with `npx jiti`, so a fix measured here is the fix that ships. Study data lives in the main checkout's git-ignored `data/raw/quality/<study>/` (worktrees symlink `data/raw` to it): `corpus/` with `manifest.json`, `runs/<label>/`, `packets/`. The first study is `2026-11`: `corpus/` is round 2, `corpus-r1/` round 1, and `runs/out2`, `runs/out3` its units and outputs. Settings are `--name=value` or environment variables; the usage is at the top of each script.

1. Units, once per corpus: `STUDY=2026-11 npx jiti .claude/skills/real-content-quality/scripts/build-units.ts` writes `runs/units-<sha>/units.jsonl`, one line per card or paragraph:
   - videos through `captionCards` (`parseYouTubeJson3`, `alignByOverlap`, `asrSentenceCards`), with the translation the extension would pick;
   - Netflix re-aligned from raw TTML/WebVTT tracks when they were saved (`timed`), else the rendered cards;
   - article paragraphs as they are.
2. Rows and numbers, once per checkout on the same units: `REPO=<checkout> UNITS=<units.jsonl> OUT=<study>/runs/<label> npx jiti .claude/skills/real-content-quality/scripts/measure.ts` (`LEVEL` 3000, `LEARNING` en, `NATIVE` ja by default). It writes:
   - `summary.json` per site: unknown tokens, words shown as New and phrase highlights per 1,000 tokens, names, hover lines over the width cap, cards with no native line, load and classify times;
   - `rows.jsonl`: one row per word token and per phrase, with its key, category, hover lines, where the meaning came from, and the sentence.

The rows are made as the extension makes them; `src/core/classify.smoke.test.ts` is the reference for the wiring:
- the pair's pack, classifier and dictionary from `createLanguageResources` (`createEnJaDictionary` for en-ja, the pair or definitions dictionary for others);
- names from each document's casing (`blockCasing`/`documentCasing` over its units);
- hover lines from `dictionary.entry(key, written, pos).lines`, the `shortLines` the hover card shows.

What it cannot reproduce, left to Phase 7:
- meanings Chrome translates at display time: a row has only the English definition that would be translated (`hoverKind: "translated"`), and a phrase with no entry is translated literally (`"literal"`);
- whatever depends on live site behaviour.

Spot-check a few units against the real UI; they should match. Baseline: on the 2026-11 corpus, main after PR #62 gives 171,709 tokens, 3,979 unknown, 84.4 New and 26.7 phrases per 1,000 tokens, and 1,051 names.

## Phase 3 — Judge blind

Build packets from two runs and have **subagents** judge them with a fixed rubric ([references/judging.md](references/judging.md)):

```
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before <run> --after <run> --out <study>/packets/<tag> --tag <tag> --packets 3
```

It writes the packets, `key-<tag>.json` and `RUBRIC.txt`. Each judge sees only `RUBRIC.txt` and its packet, with the versions shown as X and Y in random order, and writes `result-<packet>.json`. Each item gets:
- a hover verdict: good, acceptable, wrong or misleading;
- for each phrase, a label (useful, low-value or wrong-match) and whether its meaning fits;
- the expressions a learner needed that were missed;
- a preference between the versions.

Then tally: `python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key <dir>/key-<tag>.json <dir>/result-*.json`.

When reporting:
- Samples over-represent changed items; the tally re-weights rates to the corpus. Report those.
- There is one judge per item, so treat differences under about ±4 points as noise.
- Also report what needs no judge, from each run's `summary.json`: tokens with no hover, highlights per 1,000 tokens, lines over the width cap, cards with no native line.

## Phase 4 — Root causes, prototypes, blind A/B

1. Group failures by cause, not by symptom. For example, "the hover is one string chosen at build time" explains just → 正しい, decided → 明白な and the 300-character dumps at once.
2. Prototype fixes **outside the repo** (in the study folder's `proto/`, so the next session finds them), still calling Lingo's code where possible.
3. Run a blind A/B of the current build against the prototype. Then run a second A/B on a **fresh** sample. Then judge the held-out site with the prototype frozen.
4. Keep a "What was tested" table: idea, result with numbers, decision (Recommended, Refined or Dropped).
   - Dropped ideas are findings too. For example, Gemini Nano picking senses (72% vs 70%) or verifying them (it rejected 3 of 4 good ones) is why the on-device model is kept to user-initiated "Ask AI".
5. For each candidate, measure what it costs and what it breaks:
   - bundle size: packs stay ≤ 50 MB raw and each file < 4 MB (`pack-sizes.test.ts`);
   - first-highlight latency (E2E cold; measure the current baseline first);
   - highlight density.

## Phase 5 — Report and decisions

Write `docs/notes/<topic>.md` on a report branch (local commits; push only if asked). These sections worked:
- Method
- Results (current build)
- Root causes
- What was tested
- Recommended fixes by layer (CORE/LEARNING/NATIVE/PAIR tables, with evidence)
- What a new pair needs
- Costs and decisions for you
- Still open
- Suggested order
- Measuring

Then put each open trade-off to the user, with the measured options.

## Phase 6 — Ship in steps, one subagent per step

- The parent session coordinates. Each step of "Suggested order" runs as a background subagent in its own worktree from `origin/main` (memory: subagent per phase). Brief template: [references/step-brief.md](references/step-brief.md).
- Order: small, deterministic fixes first. Data rebuilds come later because they move many numbers at once.
- After each hand-back, check before telling the user:
  - `gh pr view <n> --json state,mergeCommit,statusCheckRollup`;
  - no Claude attribution in the commits or the PR body;
  - the measured numbers against what the step promised.
- Then update the report's "Suggested order" with the PR and its measured result, including what got worse.

CI notes:
- Merge only through `~/.claude/scripts/merge-when-green.sh`.
- Known flakes get one rerun; anything else is fixed. As of 2026-11: Firefox VideoPanel drag/selection, Firefox fullscreen-sidebar layout, Netflix "Fullscreen request denied". Check the latest step PRs for changes to this list.
- When packs grow, E2E waits on the first cold dictionary load overrun 5 s on the CI runner. Those waits use `COLD_LOAD` (`e2e/page.ts`); give any new first-load wait the same.

## Phase 7 — Check on the real sites

After the user-visible steps, and once at the end:
1. Build the check build in a worktree that matches `origin/main` (`npx wxt build --mode check`), then copy it into the folder Chrome loaded, the **main checkout's** `.output/lingo-check`:
   `node --input-type=module -e "import {syncBuild,buildId} from './scripts/build-check.ts'; syncBuild('.output/chrome-mv3-check','<main checkout>/.output/lingo-check', buildId(new Date(),'<sha>'))"`
   (`npm run build:check` writes only to its own checkout's `.output`.)
2. Reload the tabs. The extension reloads itself, so a page opened before that answers `connected:false`; reload that page.
3. On one article, one YouTube video and one Netflix episode, hover what the steps changed.

Hints:
- Pause videos first with `document.querySelector('video').pause()`; the transcript follows playback and moves the targets.
- The check build keeps Lingo's shadow roots open, but the browser tools sometimes withhold page text; hover and use `zoom` screenshots to read hover cards.
- Look especially at:
  - text that skips the build-time rules (meanings machine-translated at display time escaped the short-line cap);
  - interactions between steps (adding vocabulary turned "Nov" into a clipping of novice).

Record the findings in the report: what works, what is still wrong, and the general fix each suggests. Offer the fixes as a follow-up session. Finish with the error log read, every entry explained, and the log cleared.
