/** A word inside a cue, with its own start time (YouTube ASR gives one per word). */
export interface CueWord {
  startMs: number;
  /** Raw text as the site sent it, including any leading space. */
  text: string;
}

/** One subtitle line (or a few lines shown together). Lines are separated by "\n". */
export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
  /** Word timings, only when the source has them (YouTube ASR). */
  words?: CueWord[];
}

export type TrackKind = "manual" | "asr";

/** A subtitle track a site offers for the current video. */
export interface Track {
  id: string;
  /** BCP 47 language code as the site gives it (en, ja, pt-BR, zh-Hans…). */
  lang: string;
  kind: TrackKind;
  label: string;
}
