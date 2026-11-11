import { alignAsrSentences, asrSentenceCards } from "../../core/subtitles/asr";
import { sentenceCards } from "../../core/subtitles/cues";
import { alignByOverlap, joinerFor } from "../../core/subtitles/translation";
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
  // YouTube translates an auto-generated track sentence by sentence: follow its sentences.
  const aligned =
    asr && translation.source === "siteAutoTranslate"
      ? alignAsrSentences(captions.cues, translation.cues, {
          joiner,
          lang: captions.track.lang,
          translationJoiner: joinerFor(translation.lang),
        })
      : undefined;
  const { cards: cues, lines } =
    aligned ??
    (asr
      ? asrSentenceCards(captions.cues, { joiner, lang: captions.track.lang })
      : sentenceCards(captions.cues, { joiner }));
  return {
    state: {
      cues,
      lines,
      spans: cues.map(() => null),
      translationSource: translation.source,
      translations:
        aligned?.translations ??
        (site
          ? alignByOverlap(cues, translation.cues, { lang: translation.lang })
          : cues.map(() => "")),
    },
    // Merged sentences no longer match the fragments' timing: show the aligned text.
    timed:
      site && !asr
        ? { cues: translation.cues, joiner: joinerFor(translation.lang) }
        : null,
  };
}
