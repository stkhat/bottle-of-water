import type { WordStatus } from "../../core/classify";
import type { DictionaryEntry } from "../../core/lexicon/dictionary";
import { t } from "../../i18n/t";
import type {
  OccurrenceView,
  TermSummary,
  YourMeaning,
} from "../../messaging/protocol";
import { sameDay, shortDate } from "../../ui/format/format";
import { occurrenceItem } from "../../ui/lookup/elsewhere";
import { ElsewhereRow } from "../../ui/lookup/ElsewhereRow";
import { EntryHeader } from "../../ui/lookup/EntryHeader";
import { StatusButtons } from "../../ui/lookup/StatusButtons";
import { BookmarkIcon } from "../../ui/icons";
import { aiTag, color, iconButton, sectionHeading } from "../../ui/styles";

/** The selected word: its row, its status now, and what `lookup` gave. */
export interface Details {
  term: TermSummary;
  status: WordStatus;
  entry?: DictionaryEntry;
  /** The pack's IPA, also for a phrase no dictionary has (`LookupResult.ipa`). */
  ipa?: string;
  occurrences: OccurrenceView[];
  /** The meanings chosen for its sentences (`LookupResult.yourMeanings`). */
  meanings: YourMeaning[];
}

/** "Where you saw it" grouped by the meaning chosen there; `meaning` missing: none chosen. */
interface SeenGroup<T> {
  meaning?: YourMeaning;
  items: T[];
}

/**
 * The places grouped by the meaning chosen there, in order of first appearance, the
 * places with none last; one group without a heading when no place has a meaning.
 */
function seenGroups<T>(
  occurrences: readonly OccurrenceView[],
  items: readonly T[],
  meanings: readonly YourMeaning[],
): SeenGroup<T>[] {
  const byKey = new Map(meanings.map((m) => [m.key, m]));
  const groups = new Map<string, SeenGroup<T>>();
  const none: T[] = [];
  occurrences.forEach((o, i) => {
    const meaning =
      o.meaningKey === undefined ? undefined : byKey.get(o.meaningKey);
    if (!meaning) {
      none.push(items[i]!);
      return;
    }
    const group = groups.get(meaning.key);
    if (group) group.items.push(items[i]!);
    else groups.set(meaning.key, { meaning, items: [items[i]!] });
  });
  return [...groups.values(), ...(none.length > 0 ? [{ items: none }] : [])];
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
  // The row is read again after a status change; the details keep the term as picked.
  const learnedAt = props.row?.learnedAt;
  const items = occurrences.map((o) => {
    const item = occurrenceItem(o);
    const parts = [item.meta];
    if (!sameDay(o.seenAt, now)) parts.push(shortDate(o.seenAt, now));
    if (o.origin === "saved") parts.push(t("wordlist.savedHere"));
    return { ...item, meta: parts.join(" · ") };
  });
  const groups = seenGroups(occurrences, items, details.meanings);
  // A term without meanings of the user's lists its places as before.
  const labelled = groups.some((group) => group.meaning);
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

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <StatusButtons
            status={details.status}
            onStatus={props.onStatus}
            removeBorder={color.chipLine}
            saveDisabled={!savedFrom(occurrences)}
          />
          {details.status === "known" && learnedAt !== undefined && (
            <p style={{ margin: 0, fontSize: "13px", color: color.muted }}>
              {t("wordlist.learnedOn", { date: shortDate(learnedAt, now) })}
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={sectionHeading}>
            {t("wordlist.seenIn", { count: items.length })}
          </h3>
          {groups.map((group, g) => (
            <div
              key={group.meaning?.key ?? ""}
              data-seen-group
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {labelled && (
                <GroupHeading
                  meaning={group.meaning}
                  count={group.items.length}
                  nativeLang={props.nativeLang}
                />
              )}
              {group.items.map((item, i) => (
                <ElsewhereRow
                  key={`${g}-${i}`}
                  item={item}
                  lang={props.learningLang}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * A group's heading (mock WordListMeanings): the bookmark, the meaning, "AI" when the
 * model gave it, and "· N"; "No meaning chosen" for the places with none.
 */
function GroupHeading(props: {
  meaning: YourMeaning | undefined;
  count: number;
  nativeLang: string;
}) {
  const { meaning } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "6px",
      }}
    >
      {meaning && <BookmarkIcon label={t("dict.yourMeaning")} />}
      <span
        lang={meaning ? (meaning.lineLang ?? props.nativeLang) : undefined}
        style={
          meaning
            ? { fontSize: "14px", fontWeight: 600, color: color.ink }
            : { fontSize: "13px", fontWeight: 600, color: color.muted }
        }
      >
        {meaning ? meaning.line : t("wordlist.noMeaning")}
      </span>
      {meaning?.from === "ai" && <span style={aiTag}>{t("dict.ai")}</span>}
      <span
        style={{ fontSize: "12px", color: color.muted, whiteSpace: "nowrap" }}
      >
        {t("wordlist.groupCount", { count: props.count })}
      </span>
    </div>
  );
}
