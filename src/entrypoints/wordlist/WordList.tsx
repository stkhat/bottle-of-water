import type { CSSProperties } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { DictionaryEntry } from "../../core/dictionary";
import { t, type MessageKey } from "../../i18n/t";
import type { OccurrenceView, TermSummary } from "../../messaging/protocol";
import {
  BackupButtons,
  type BackupDeps,
  type BackupNote,
} from "../../ui/backup/BackupButtons";
import { sameDay, shortDate } from "../../ui/format/format";
import { ElsewhereRow } from "../../ui/lookup/DictionaryWindow";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import { StatusButtons } from "../../ui/lookup/StatusButtons";
import {
  badge,
  color,
  FONT,
  IPA_FONT,
  iconButton,
  sectionHeading,
} from "../../ui/lookup/styles";

/** What the word list works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface WordListDeps extends BackupDeps {
  /** Says `text` aloud in the language `lang`. */
  speak(text: string, lang: string): void;
}

type Style = CSSProperties;
type StatusFilter = "all" | "learning" | "known";
type KindFilter = "all" | "word" | "phrase";
type Sort = "recent" | "az" | "seen";

/** The selected word: its row, its status now, and what `lookup` gave. */
interface Details {
  term: TermSummary;
  status: WordStatus;
  entry?: DictionaryEntry;
  /** The pack's IPA, also for a phrase no dictionary has (`LookupResult.ipa`). */
  ipa?: string;
  occurrences: OccurrenceView[];
}

const CSS = `
body{margin:0;background:${color.surface}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 16px;border-radius:8px;border:1px solid ${color.lineStrong};background:#FFFFFF;color:${color.ink};font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.sel{height:40px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:#FFFFFF;color:${color.ink};font:inherit;font-size:14px}
.th{font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};font-weight:600;text-align:left;padding:0 12px 10px}
.rowb:hover{background:${color.surface} !important}
.ib:hover{background:${color.surfaceGray} !important}
`;

const COLUMNS = "220px minmax(0, 1fr) 110px 70px 110px";
/** A row's height plus the gap under it (px). */
const ROW_STRIDE = 50;
/** Above this many rows, only the rows in view are rendered. */
const WINDOW_ABOVE = 500;
/** Rows rendered beyond the view on each side while windowing. */
const OVERSCAN = 6;

const STATUS_TABS: readonly [StatusFilter, MessageKey][] = [
  ["all", "wordlist.all"],
  ["learning", "wordlist.learning"],
  ["known", "wordlist.known"],
];
const KIND_TABS: readonly [KindFilter, MessageKey][] = [
  ["all", "wordlist.all"],
  ["word", "wordlist.words"],
  ["phrase", "wordlist.phrases"],
];
const SORTS: readonly [Sort, MessageKey][] = [
  ["recent", "wordlist.sort.recent"],
  ["az", "wordlist.sort.az"],
  ["seen", "wordlist.sort.seen"],
];

const byKey = (a: TermSummary, b: TermSummary) => a.key.localeCompare(b.key);
const COMPARE: Record<Sort, (a: TermSummary, b: TermSummary) => number> = {
  recent: (a, b) => b.lastSeen - a.lastSeen || byKey(a, b),
  az: byKey,
  seen: (a, b) => b.seen - a.seen || b.lastSeen - a.lastSeen || byKey(a, b),
};

/** Mock WordList `segBtn`: a segmented control's button. */
const segment = (active: boolean): Style => ({
  height: "34px",
  padding: "0 14px",
  borderRadius: "8px",
  border: 0,
  font: "inherit",
  fontSize: "13px",
  cursor: "pointer",
  ...(active
    ? {
        background: color.white,
        color: color.ink,
        fontWeight: 600,
        boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
      }
    : { background: "transparent", color: color.ink3 }),
});

function Segmented<T extends string>(props: {
  label: string;
  tabs: readonly [T, MessageKey][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "2px",
        padding: "3px",
        borderRadius: "10px",
        background: "#E8EAEE",
      }}
    >
      {props.tabs.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={props.value === value}
          onClick={() => props.onChange(value)}
          style={segment(props.value === value)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function StatusBadge(props: { status: TermSummary["status"] }) {
  const learning = props.status === "learning";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "24px",
        padding: "0 9px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: learning ? "#D3F1E5" : color.surfaceGray,
        color: learning ? color.greenDark : color.ink2,
      }}
    >
      {t(learning ? "wordlist.learning" : "wordlist.known")}
    </span>
  );
}

const phraseTag: Style = {
  fontSize: "11px",
  fontWeight: 600,
  color: color.greenDark,
  background: color.greenPale,
  borderRadius: "999px",
  padding: "2px 7px",
};

function Row(props: {
  term: TermSummary;
  selected: boolean;
  nativeLang: string;
  now: number;
  onPick: () => void;
  style?: Style;
}) {
  const { term, selected } = props;
  return (
    <button
      type="button"
      class={selected ? undefined : "rowb"}
      aria-pressed={selected}
      onClick={props.onPick}
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        alignItems: "center",
        width: "100%",
        height: "48px",
        flex: "none",
        boxSizing: "border-box",
        textAlign: "left",
        borderRadius: "8px",
        font: "inherit",
        color: color.ink,
        cursor: "pointer",
        padding: 0,
        margin: 0,
        ...(selected
          ? {
              background: color.greenPale,
              border: `1px solid ${color.greenLine}`,
            }
          : { background: "transparent", border: "1px solid transparent" }),
        ...props.style,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          minWidth: 0,
        }}
      >
        <span
          data-head
          style={{
            fontSize: "15px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {term.key}
        </span>
        {term.kind === "phrase" && (
          <span style={phraseTag}>{t("wordlist.phrase")}</span>
        )}
      </span>
      <span
        lang={term.glossLang ?? props.nativeLang}
        style={{
          padding: "0 12px",
          fontSize: "14px",
          color: color.ink2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {term.short ?? ""}
      </span>
      <span style={{ padding: "0 12px" }}>
        <StatusBadge status={term.status} />
      </span>
      <span
        style={{
          padding: "0 12px",
          fontSize: "14px",
          color: color.ink3,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {term.seen}
      </span>
      <span style={{ padding: "0 12px", fontSize: "13px", color: color.muted }}>
        {shortDate(term.lastSeen, props.now)}
      </span>
    </button>
  );
}

/** The rows, all of them, or only those in view above `WINDOW_ABOVE`. */
function Rows(props: {
  rows: TermSummary[];
  selectedId: string | null;
  nativeLang: string;
  now: number;
  empty: string | null;
  onPick: (term: TermSummary) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const windowed = props.rows.length > WINDOW_ABOVE;

  useEffect(() => {
    const element = scroller.current;
    if (!element || !windowed) return;
    const measure = () =>
      setView({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [windowed]);

  const row = (term: TermSummary, style?: Style) => (
    <Row
      key={term.id}
      term={term}
      selected={term.id === props.selectedId}
      nativeLang={props.nativeLang}
      now={props.now}
      onPick={() => props.onPick(term)}
      {...(style && { style })}
    />
  );

  let content;
  if (windowed) {
    const first = Math.max(0, Math.floor(view.top / ROW_STRIDE) - OVERSCAN);
    const last = Math.min(
      props.rows.length,
      Math.ceil((view.top + view.height) / ROW_STRIDE) + OVERSCAN,
    );
    content = (
      <div
        style={{
          position: "relative",
          flex: "none",
          height: `${props.rows.length * ROW_STRIDE - 2}px`,
        }}
      >
        {props.rows.slice(first, last).map((term, i) =>
          row(term, {
            position: "absolute",
            left: 0,
            top: `${(first + i) * ROW_STRIDE}px`,
          }),
        )}
      </div>
    );
  } else content = props.rows.map((term) => row(term));

  return (
    <div
      ref={scroller}
      data-rows
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      {content}
      {props.empty && (
        <p
          style={{
            margin: 0,
            padding: "24px 12px",
            fontSize: "14px",
            color: color.muted,
          }}
        >
          {props.empty}
        </p>
      )}
    </div>
  );
}

const SPEAKER = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
    <path d="M16 9a4 4 0 0 1 0 6"></path>
    <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"></path>
  </svg>
);

/** The occurrence a removed word is saved again from: where it was saved, else the newest. */
const savedFrom = (occurrences: readonly OccurrenceView[]) =>
  occurrences.find((o) => o.origin === "saved") ?? occurrences[0];

function DetailsPanel(props: {
  details: Details;
  nativeLang: string;
  now: number;
  onStatus: (status: WordStatus) => void;
  onSpeak: (head: string) => void;
}) {
  const { details, now } = props;
  const { entry, term, occurrences } = details;
  const head = entry?.head ?? term.key;
  const ipa = entry?.ipa ?? details.ipa;
  const items = elsewhereItems(occurrences).map((item, i) => {
    const o = occurrences[i]!;
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
        background: color.white,
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
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 650,
                letterSpacing: "-0.01em",
              }}
            >
              {head}
            </h2>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: color.greenDark,
                background: color.greenPale,
                borderRadius: "999px",
                padding: "3px 9px",
              }}
            >
              {t(
                term.kind === "phrase"
                  ? "lookup.kind.phrase"
                  : "lookup.kind.word",
              )}
            </span>
            <button
              type="button"
              class="ib"
              aria-label={t("dict.speak")}
              onClick={() => props.onSpeak(head)}
              style={iconButton}
            >
              {SPEAKER}
            </button>
          </div>
          {ipa && (
            <span
              style={{
                fontFamily: IPA_FONT,
                fontSize: "16px",
                color: color.ink3,
              }}
            >
              {ipa}
            </span>
          )}
          {entry?.short && (
            <p
              lang={entry.glossLang ?? props.nativeLang}
              style={{ margin: 0, fontSize: "17px", lineHeight: 1.5 }}
            >
              {entry.short}
            </p>
          )}
        </div>

        <StatusButtons
          status={details.status}
          onStatus={props.onStatus}
          removeBorder="#8C92A3"
          saveDisabled={!savedFrom(occurrences)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={sectionHeading}>
            {t("wordlist.seenIn", { count: items.length })}
          </h3>
          {items.map((item, i) => (
            <ElsewhereRow key={i} item={item} />
          ))}
        </div>
      </div>
    </aside>
  );
}

const warn = (error: unknown) => console.warn("Lingo:", error);

/** The word list page (mock WordList): saved words, filters, and the selected word's details. */
export function WordList({ deps }: { deps: WordListDeps }) {
  const [langs, setLangs] = useState<{ learning: string; native: string }>();
  const [terms, setTerms] = useState<TermSummary[]>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  /** The selection the last lookup was for, so a late answer is dropped. */
  const looking = useRef<string | null>(null);
  const now = deps.now();

  async function reload(lang = langs?.learning) {
    if (!lang) return;
    setTerms(await deps.send({ type: "listTermsWithStats", lang }));
  }

  useEffect(() => {
    deps.send({ type: "getSettings" }).then((settings) => {
      setLangs({
        learning: settings.learningLang,
        native: settings.nativeLang,
      });
      return reload(settings.learningLang);
    }, warn);
  }, []);

  useEffect(() => {
    if (!langs) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reload().catch(warn);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [langs]);

  const rows = useMemo(() => {
    if (!terms) return [];
    const q = query.trim().toLowerCase();
    return terms
      .filter(
        (term) =>
          (status === "all" || term.status === status) &&
          (kind === "all" || term.kind === kind) &&
          (!q ||
            term.key.toLowerCase().includes(q) ||
            (term.short ?? "").toLowerCase().includes(q)),
      )
      .sort(COMPARE[sort]);
  }, [terms, query, status, kind, sort]);

  // The first row is selected when the list first shows.
  useEffect(() => {
    if (selectedId === null && rows[0]) select(rows[0]);
  }, [rows]);

  function select(term: TermSummary) {
    if (!langs) return;
    setSelectedId(term.id);
    looking.current = term.id;
    deps
      .send({
        type: "lookup",
        lang: langs.learning,
        key: term.key,
        kind: term.kind,
      })
      .then((result) => {
        if (looking.current !== term.id) return;
        setDetails({
          term,
          status: result.status,
          ...(result.entry && { entry: result.entry }),
          ...(result.ipa !== undefined && { ipa: result.ipa }),
          occurrences: [...result.here, ...result.elsewhere],
        });
      }, warn);
  }

  async function changeStatus(to: WordStatus) {
    if (!details || !langs || to === details.status) return;
    const { term } = details;
    try {
      if (to === "new") {
        await deps.send({ type: "removeTerm", id: term.id });
      } else if (details.status === "new") {
        const o = savedFrom(details.occurrences);
        if (!o) return;
        await deps.send({
          type: "saveTerm",
          lang: langs.learning,
          key: term.key,
          display: term.display,
          kind: term.kind,
          status: to,
          source: { ...o.source, lang: langs.learning },
          sentence: o.sentence,
          ...(o.translation !== undefined && { translation: o.translation }),
          pos: o.pos,
        });
      } else {
        await deps.send({ type: "setStatus", id: term.id, status: to });
      }
      setDetails((current) =>
        current?.term.id === term.id ? { ...current, status: to } : current,
      );
      await reload();
    } catch (error) {
      warn(error);
    }
  }

  if (!langs || !terms) return null;

  const empty =
    terms.length === 0
      ? t("wordlist.empty")
      : rows.length === 0
        ? t("wordlist.noMatch")
        : null;

  return (
    <div
      style={{
        height: "100vh",
        minHeight: "560px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "32px 64px",
        background: color.surface,
        color: color.ink,
        fontFamily: FONT,
      }}
    >
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={badge(32, 9, 16)}>L</span>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>
          {t("wordlist.title")}
        </h1>
        <span style={{ fontSize: "14px", color: color.muted }}>
          {t("app.languagePair")}
        </span>
        <span style={{ flex: 1 }}></span>
        {note && (
          <span
            role="status"
            style={{
              fontSize: "13px",
              color: note.ok ? color.greenDark : "#B42318",
            }}
          >
            {note.text}
          </span>
        )}
        <BackupButtons
          deps={deps}
          class="btn"
          onNote={setNote}
          onImported={() => void reload().catch(warn)}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "320px",
            height: "40px",
            padding: "0 12px",
            boxSizing: "border-box",
            border: `1px solid ${color.lineStrong}`,
            borderRadius: "8px",
            background: color.white,
            color: color.muted,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6"></circle>
            <path d="M20 20l-4.5-4.5"></path>
          </svg>
          <input
            type="search"
            aria-label={t("wordlist.search")}
            placeholder={t("wordlist.searchPlaceholder")}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: "none",
              color: color.ink,
              font: "inherit",
              fontSize: "14px",
              outline: "none",
            }}
          />
        </label>
        <Segmented
          label={t("wordlist.status")}
          tabs={STATUS_TABS}
          value={status}
          onChange={setStatus}
        />
        <Segmented
          label={t("wordlist.kind")}
          tabs={KIND_TABS}
          value={kind}
          onChange={setKind}
        />
        <span style={{ flex: 1 }}></span>
        <label for="sort" style={{ fontSize: "13px", color: color.muted }}>
          {t("wordlist.sort")}
        </label>
        <select
          id="sort"
          class="sel"
          value={sort}
          onChange={(e) => setSort(e.currentTarget.value as Sort)}
        >
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "20px" }}>
        <section
          aria-label={t("wordlist.list")}
          style={{
            flex: 1,
            minWidth: 0,
            background: color.white,
            border: `1px solid ${color.line}`,
            borderRadius: "14px",
            padding: "16px 8px 8px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: COLUMNS }}>
            <span class="th">{t("wordlist.col.word")}</span>
            <span class="th">{t("wordlist.col.meaning")}</span>
            <span class="th">{t("wordlist.col.status")}</span>
            <span class="th">{t("wordlist.col.seen")}</span>
            <span class="th">{t("wordlist.col.lastSeen")}</span>
          </div>
          <Rows
            rows={rows}
            selectedId={selectedId}
            nativeLang={langs.native}
            now={now}
            empty={empty}
            onPick={select}
          />
        </section>
        {details && (
          <DetailsPanel
            details={details}
            nativeLang={langs.native}
            now={now}
            onStatus={(to) => void changeStatus(to)}
            onSpeak={(head) => deps.speak(head, langs.learning)}
          />
        )}
      </div>
    </div>
  );
}
