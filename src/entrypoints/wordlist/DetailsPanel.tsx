import type { WordStatus } from "../../core/classify";
import type { DictionaryEntry } from "../../core/lexicon/dictionary";
import { t } from "../../i18n/t";
import type { OccurrenceView, TermSummary } from "../../messaging/protocol";
import { sameDay, shortDate } from "../../ui/format/format";
import { occurrenceItem } from "../../ui/lookup/elsewhere";
import { ElsewhereRow } from "../../ui/lookup/ElsewhereRow";
import { EntryHeader } from "../../ui/lookup/EntryHeader";
import { StatusButtons } from "../../ui/lookup/StatusButtons";
import { color, iconButton, sectionHeading } from "../../ui/styles";

/** The selected word: its row, its status now, and what `lookup` gave. */
export interface Details {
  term: TermSummary;
  status: WordStatus;
  entry?: DictionaryEntry;
  /** The pack's IPA, also for a phrase no dictionary has (`LookupResult.ipa`). */
  ipa?: string;
  occurrences: OccurrenceView[];
}

/** The occurrence a removed word is saved again from: where it was saved, else the newest. */
export const savedFrom = (occurrences: readonly OccurrenceView[]) =>
  occurrences.find((o) => o.origin === "saved") ?? occurrences[0];

export function DetailsPanel(props: {
  details: Details;
  /** The selected term's row now: its meaning may have been translated since. */
  row: TermSummary | undefined;
  nativeLang: string;
  /** The language of the term and its sentences. */
  learningLang: string;
  now: number;
  onStatus: (status: WordStatus) => void;
  onSpeak: (head: string) => void;
}) {
  const { details, now } = props;
  const { entry, term, occurrences } = details;
  const head = entry?.head ?? term.key;
  const items = occurrences.map((o) => {
    const item = occurrenceItem(o);
    const parts = [item.meta];
    if (!sameDay(o.seenAt, now)) parts.push(shortDate(o.seenAt, now));
    if (o.origin === "saved") parts.push(t("wordlist.savedHere"));
    return { ...item, meta: parts.join(" · ") };
  });
  return (
    <aside
      aria-label={t("wordlist.details")}
      style={{
        width: "400px",
        flex: "none",
        background: color.card,
        border: `1px solid ${color.line}`,
        borderRadius: "14px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <EntryHeader
          head={head}
          kind={term.kind}
          ipa={entry?.ipa ?? details.ipa}
          {...(props.row?.machineTranslated
            ? { short: props.row.short, shortLang: props.nativeLang }
            : {
                short: entry?.short,
                shortLang: entry?.glossLang ?? props.nativeLang,
              })}
          onSpeak={() => props.onSpeak(head)}
          speakStyle={iconButton}
          speakClass="ib"
        />

        <StatusButtons
          status={details.status}
          onStatus={props.onStatus}
          removeBorder={color.chipLine}
          saveDisabled={!savedFrom(occurrences)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={sectionHeading}>
            {t("wordlist.seenIn", { count: items.length })}
          </h3>
          {items.map((item, i) => (
            <ElsewhereRow key={i} item={item} lang={props.learningLang} />
          ))}
        </div>
      </div>
    </aside>
  );
}
