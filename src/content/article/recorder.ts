import type { Settings } from "../../core/settings";
import type { DocumentCasing } from "../../core/text/casing";
import { splitSentences } from "../../core/text/sentences";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import type { SourceInput } from "../../messaging/protocol";
import { warn } from "../lookup/warn";
import type { SpanMap } from "./locate";
import type { TextBlock } from "./page-text";
import { sentenceAt } from "./sentence";

/**
 * What one page view records: the blocks' sentences for the sentence history, and the
 * saved terms on the page with their sentences; each once.
 */
export function createRecorder(o: {
  send: typeof send;
  lang: string;
  source(): SourceInput;
  settings(): Settings;
  spans: SpanMap;
  /** The page's casing: the history leaves its names out. */
  casing(): DocumentCasing | undefined;
}) {
  const { lang } = o;
  const kept = new Set<string>();
  /** "key\nsentence" already recorded. */
  const recorded = new Set<string>();

  return {
    history(blocks: TextBlock[]) {
      if (!o.settings().sentenceHistory) return;
      const sentences = [];
      for (const block of blocks) {
        for (const text of splitSentences(block.text, lang)) {
          if (kept.has(text)) continue;
          kept.add(text);
          sentences.push({ text, pos: { textQuote: text } });
        }
      }
      if (sentences.length === 0) return;
      const casing = o.casing();
      o.send({
        type: "recordHistory",
        source: o.source(),
        sentences,
        ...(casing && { casing }),
      }).catch(warn);
    },
    encounters(blocks: TextBlock[], saved: ReadonlySet<string>) {
      const items = [];
      for (const block of blocks) {
        for (const span of o.spans.get(block) ?? []) {
          if (span.category === "ignored" || !saved.has(span.key)) continue;
          const sentence = sentenceAt(block.text, span.start, span.end, lang);
          const seen = `${span.key}\n${sentence}`;
          if (recorded.has(seen)) continue;
          recorded.add(seen);
          items.push({
            termId: termId(lang, span.key),
            sentence,
            pos: { textQuote: sentence },
          });
        }
      }
      if (items.length > 0)
        o.send({ type: "recordEncounters", source: o.source(), items }).catch(
          warn,
        );
    },
  };
}
