import {
  alignAsrSentences,
  asrSentenceCards,
  cueWords,
} from "../../core/subtitles/asr";
import {
  alignByOverlap,
  joinCoveredCards,
  joinerFor,
} from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import type { VideoCaptions } from "./platform";
import type { VideoState } from "./state";

/** The site's translation track, read by time for the subtitle. */
export interface TimedTranslation {
  cues: Cue[];
  /** Joins the lines of a translation cue. */
  joiner: string;
}

/**
 * The transcript's cards, the lines the video shows and each card's translation, from
 * the subtitles the adapter read.
 */
export function captionCards(captions: VideoCaptions): {
  state: Pick<
    VideoState,
    "cues" | "lines" | "spans" | "translationSource" | "translations"
  >;
  timed: TimedTranslation | null;
} {
  const asr = captions.track.kind === "asr";
  const joiner = joinerFor(captions.track.lang);
  const { translation } = captions;
  const site =
    translation.source === "siteTrack" ||
    translation.source === "siteAutoTranslate";
  // Cards are the original's sentences however the site cut its cues: a manual track's cues
  // get word times spread over their text and go through the same sentence rules, each cue
  // staying one subtitle line.
  const cues = asr
    ? captions.cues
    : captions.cues.map((cue) => ({ ...cue, words: cueWords(cue) }));
  const options = { joiner, lang: captions.track.lang, linesByCue: !asr };
  // YouTube translates a track sentence by sentence: follow its sentences.
  const aligned =
    translation.source === "siteAutoTranslate"
      ? alignAsrSentences(cues, translation.cues, {
          ...options,
          translationJoiner: joinerFor(translation.lang),
        })
      : undefined;
  const sentences = aligned ?? asrSentenceCards(cues, options);
  // A human translation line that covers most of two sentences translates them together.
  const { cards, lines } =
    translation.source === "siteTrack"
      ? joinCoveredCards(sentences, translation.cues, joiner)
      : sentences;
  return {
    state: {
      cues: cards,
      lines,
      spans: cards.map(() => null),
      translationSource: translation.source,
      translations:
        aligned?.translations ??
        (site
          ? alignByOverlap(cards, translation.cues, { lang: translation.lang })
          : cards.map(() => "")),
    },
    // Merged sentences no longer match the fragments' timing: show the aligned text.
    timed:
      site && !asr
        ? { cues: translation.cues, joiner: joinerFor(translation.lang) }
        : null,
  };
}
