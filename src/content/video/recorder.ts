import type { Settings } from "../../core/settings";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import type { SourceInput } from "../../messaging/protocol";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { VideoState } from "./state";

/**
 * What one video records: the saved terms of the cards that play (once per term and
 * card) and the played cards for the sentence history (never the whole track).
 */
export function createRecorder(o: {
  send: typeof send;
  store: Store<VideoState>;
  settings(): Settings;
  lang(): string;
  flat(text: string): string;
  source(): SourceInput;
  /** Still the video on the page. */
  active(): boolean;
}) {
  const played = new Set<number>();
  /** "key\ncard index" already recorded. */
  const recorded = new Set<string>();
  /** Saved terms, as the analyses and the changes here found them. */
  const saved = new Set<string>();

  return {
    saved,
    /** True the first time the card plays. */
    play(index: number) {
      if (played.has(index)) return false;
      played.add(index);
      return true;
    },
    /** A term saved from the card: saving recorded the card already. */
    savedFrom(key: string, index: number) {
      recorded.add(`${key}\n${index}`);
      saved.add(key);
    },
    /** Tells the background which saved terms the played cards among `indices` have. */
    encounters(indices: number[]) {
      const { cues, spans, translations } = o.store.get();
      const items = [];
      for (const index of indices) {
        const cue = cues[index];
        if (!cue || !played.has(index)) continue;
        for (const span of spans[index] ?? []) {
          if (!saved.has(span.key)) continue;
          const seen = `${span.key}\n${index}`;
          if (recorded.has(seen)) continue;
          recorded.add(seen);
          const translation = translations[index];
          items.push({
            termId: termId(o.lang(), span.key),
            sentence: o.flat(cue.text),
            ...(translation ? { translation } : {}),
            pos: { timeMs: cue.startMs },
          });
        }
      }
      if (items.length > 0)
        o.send({ type: "recordEncounters", source: o.source(), items }).catch(
          warn,
        );
    },
    /** Sends a played card to the sentence history. */
    history(index: number, from: SourceInput) {
      const { cues, translations } = o.store.get();
      const cue = cues[index];
      if (!o.active() || !cue || !o.settings().sentenceHistory) return;
      const translation = translations[index];
      o.send({
        type: "recordHistory",
        source: from,
        sentences: [
          {
            text: o.flat(cue.text),
            ...(translation ? { translation } : {}),
            pos: { timeMs: cue.startMs },
          },
        ],
      }).catch(warn);
    },
  };
}
