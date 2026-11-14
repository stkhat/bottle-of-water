import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { sendStatus } from "../../content/lookup/status";
import { warn } from "../../content/lookup/warn";
import type { TranslationProvider } from "../../content/translate/translator";
import type { WordStatus } from "../../core/classify";
import type { PackStates } from "../../core/packs/state";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import { languagePair } from "../../i18n/languages";
import { t, type MessageKey } from "../../i18n/t";
import type { TermSummary } from "../../messaging/protocol";
import {
  BackupButtons,
  BackupStatus,
  type BackupDeps,
  type BackupNote,
} from "../../ui/backup/BackupButtons";
import { BrandHeader } from "../../ui/BrandHeader";
import { SearchIcon } from "../../ui/icons";
import { Segmented } from "../../ui/Segmented";
import { color, FONT, PAGE_BUTTON_CSS } from "../../ui/styles";
import { DetailsPanel, savedFrom, type Details } from "./DetailsPanel";
import { COLUMNS, Rows } from "./Rows";
import { useWordListData } from "./useWordListData";

/** What the word list works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface WordListDeps extends BackupDeps {
  speak(text: string, lang: string): void;
  /** The background's pack states now and after every change (`watchPackState`). */
  watchPackState(listener: (states: PackStates) => void): () => void;
  /** The page's translator for a pair (the browser's built-in one). */
  createTranslator(from: string, to: string): TranslationProvider;
}

type StatusFilter = "all" | "learning" | "known";
type KindFilter = "all" | "word" | "phrase";
type Sort = "recent" | "az" | "seen";

const CSS = `
body{margin:0;background:${color.surface}}
${PAGE_BUTTON_CSS}
.sel{height:40px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:${color.card};color:${color.ink};font:inherit;font-size:14px}
.th{font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};font-weight:600;text-align:left;padding:0 12px 10px}
.rowb:hover{background:${color.surface} !important}
.ib:hover{background:${color.surfaceGray} !important}
`;

const STATUS_TABS: readonly { id: StatusFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "learning", label: "status.learning" },
  { id: "known", label: "status.known" },
];
const KIND_TABS: readonly { id: KindFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "word", label: "kind.words" },
  { id: "phrase", label: "kind.phrases" },
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

/** Mock WordList's filters: a segmented control on the tab gray. */
function FilterTabs<T extends string>(props: {
  label: string;
  tabs: readonly { id: T; label: MessageKey }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <Segmented
      label={props.label}
      options={props.tabs.map((tab) => ({ ...tab, label: t(tab.label) }))}
      value={props.value}
      onPick={props.onPick}
      style={{ background: color.tab }}
      button={() => ({ height: "34px", padding: "0 14px" })}
    />
  );
}

/** The word list page (mock WordList): saved words, filters, and the selected word's details. */
export function WordList({ deps }: { deps: WordListDeps }) {
  const data = useWordListData(deps);
  const { langs, terms, reload, findTerm, packs, meanings } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  /** The selection the last lookup was for, so a late answer is dropped. */
  const looking = useRef<string | null>(null);
  /** The selected term whose lookup waits for language data. */
  const lookupWaiting = useRef<TermSummary | null>(null);
  const now = deps.now();

  data.onPacksReady.current = () => {
    const waiting = lookupWaiting.current;
    lookupWaiting.current = null;
    reload()
      .then((list) => {
        if (waiting && looking.current === waiting.id)
          select(list?.find((term) => term.id === waiting.id) ?? waiting);
      })
      .catch(warn);
  };

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
      })
      .catch((error: unknown) => {
        if (
          error instanceof PacksUnavailableError &&
          looking.current === term.id
        ) {
          // Looked up again once the data is on the device.
          lookupWaiting.current = term;
          packs.add(error.packs);
        }
        warn(error);
      });
  }

  async function changeStatus(to: WordStatus) {
    if (!details || !langs) return;
    const { term } = details;
    try {
      const sent = await sendStatus(
        deps.send,
        { termId: term.id, status: details.status },
        to,
        () => {
          const o = savedFrom(details.occurrences);
          return (
            o && {
              lang: langs.learning,
              key: term.key,
              display: term.display,
              kind: term.kind,
              source: { ...o.source, lang: langs.learning },
              sentence: o.sentence,
              ...(o.translation !== undefined && {
                translation: o.translation,
              }),
              pos: o.pos,
            }
          );
        },
      );
      if (!sent) return;
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
        <BrandHeader
          size="page"
          heading
          title={t("wordlist.title")}
          pair={languagePair(langs.learning, langs.native)}
        />
        <span style={{ flex: 1 }}></span>
        <BackupStatus note={note} />
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
            background: color.card,
            color: color.muted,
          }}
        >
          <SearchIcon />
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
        <FilterTabs
          label={t("wordlist.status")}
          tabs={STATUS_TABS}
          value={status}
          onPick={setStatus}
        />
        <FilterTabs
          label={t("wordlist.kind")}
          tabs={KIND_TABS}
          value={kind}
          onPick={setKind}
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
            background: color.card,
            border: `1px solid ${color.line}`,
            borderRadius: "14px",
            padding: "16px 8px 8px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: COLUMNS }}>
            <span class="th">{t("kind.word")}</span>
            <span class="th">{t("wordlist.col.meaning")}</span>
            <span class="th">{t("wordlist.status")}</span>
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
            onShown={(shown) =>
              meanings.shown(
                shown.map((term) => ({ key: term.id, head: term.display })),
              )
            }
          />
        </section>
        {details && (
          <DetailsPanel
            details={details}
            row={findTerm(details.term.id)}
            nativeLang={langs.native}
            learningLang={langs.learning}
            now={now}
            onStatus={(to) => void changeStatus(to)}
            onSpeak={(head) => deps.speak(head, langs.learning)}
          />
        )}
      </div>
    </div>
  );
}
