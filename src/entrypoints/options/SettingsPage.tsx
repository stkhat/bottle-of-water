import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { HistoryStatus } from "../../background/history-store";
import type { BrowserEnv } from "../../core/browser-env";
import {
  KNOWN_LEVEL_MAX,
  KNOWN_LEVEL_MIN,
  KNOWN_LEVEL_STEP,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import { learningLanguages, nativeLanguages } from "../../core/languages";
import type { SyncStatus } from "../../core/sync/backend";
import { siteFromInput } from "../../core/url";
import { languageName, languageOption } from "../../i18n/languages";
import { t, type MessageKey } from "../../i18n/t";
import type { send } from "../../messaging/client";
import {
  BackupButtons,
  type BackupDeps,
  type BackupNote,
} from "../../ui/backup/BackupButtons";
import { kilobytes, megabytes, relativeTime } from "../../ui/format/format";
import { Switch } from "../../ui/lookup/Switch";
import { badge, color, FONT } from "../../ui/lookup/styles";

/** What the settings page works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface SettingsDeps extends BackupDeps {
  send: typeof send;
  watchSettings(listener: (settings: Settings) => void): () => void;
  env: Pick<BrowserEnv, "name" | "syncName" | "features">;
  /** The extension's version, from the manifest. */
  version: string;
  /** How often the sync and history status and the relative times are refreshed. */
  refreshMs: number;
}

const SECTIONS = [
  { id: "languages", label: "settings.section.languages" },
  { id: "level", label: "settings.section.level" },
  { id: "highlighting", label: "settings.section.highlighting" },
  { id: "dictionaries", label: "settings.section.dictionaries" },
  { id: "video", label: "settings.section.video" },
  { id: "sites", label: "settings.section.sites" },
  { id: "history", label: "settings.section.history" },
  { id: "sync", label: "settings.section.sync" },
  { id: "about", label: "settings.section.about" },
] as const satisfies readonly { id: string; label: MessageKey }[];

type SectionId = (typeof SECTIONS)[number]["id"];

const CSS = `
body{background:${color.surface}}
a{color:${color.greenText}}a:hover{color:${color.greenDark}}
.card{background:#FFFFFF;border:1px solid ${color.line};border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px;scroll-margin-top:24px}
.h2{margin:0;font-size:18px;font-weight:700}
.lead{margin:-10px 0 0;font-size:14px;line-height:1.5;color:${color.muted}}
.row{display:flex;align-items:center;gap:16px;padding:12px 0;border-top:1px solid #EEF0F3}
.lbl{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.lt{font-size:15px;font-weight:600}
.ld{font-size:13px;line-height:1.45;color:${color.muted}}
.sel{height:40px;min-width:220px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:#FFFFFF;color:${color.ink};font:inherit;font-size:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 16px;border-radius:8px;border:1px solid ${color.lineStrong};background:#FFFFFF;color:${color.ink};font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.nav{display:flex;align-items:center;height:40px;padding:0 12px;border-radius:8px;color:${color.ink2};text-decoration:none;font-size:14px}
.nav:hover{background:#EEF0F3;color:${color.ink}}
.nav[aria-current="true"]{background:${color.greenPale};color:${color.greenDark};font-weight:600}
.chk{width:18px;height:18px;accent-color:${color.green};margin:0}
.soon{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};background:${color.surfaceGray};border-radius:999px;padding:3px 8px}
`;

const fmt = (n: number) => n.toLocaleString("en-US");

function Section(props: {
  id: SectionId;
  label: MessageKey;
  lead?: string;
  gap?: string;
  children: ComponentChildren;
}) {
  const heading = `${props.id}-heading`;
  return (
    <section
      id={props.id}
      class="card"
      aria-labelledby={heading}
      style={props.gap ? { gap: props.gap } : undefined}
    >
      <h2 id={heading} class="h2">
        {t(props.label)}
      </h2>
      {props.lead && <p class="lead">{props.lead}</p>}
      {props.children}
    </section>
  );
}

function SwitchRow(props: {
  title: string;
  desc: string;
  label?: string;
  checked: boolean;
  onToggle: () => void;
  first?: boolean;
  before?: ComponentChildren;
}) {
  return (
    <div
      class="row"
      style={props.first ? { borderTop: 0, paddingTop: 0 } : undefined}
    >
      {props.before}
      <span class="lbl">
        <span class="lt">{props.title}</span>
        <span class="ld">{props.desc}</span>
      </span>
      <Switch
        size="large"
        checked={props.checked}
        label={props.label ?? props.title}
        onToggle={props.onToggle}
      />
    </div>
  );
}

/** A row with a choice of a few options, side by side (mock: "New words you didn't save"). */
function ChoiceRow<T extends string>(props: {
  title: string;
  desc: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div class="row">
      <span class="lbl">
        <span class="lt">{props.title}</span>
        <span class="ld">{props.desc}</span>
      </span>
      <div
        role="group"
        aria-label={props.title}
        style={{
          display: "inline-flex",
          flex: "none",
          gap: "2px",
          padding: "3px",
          borderRadius: "10px",
          background: color.surfaceGray,
        }}
      >
        {props.options.map((option) => {
          const on = option.id === props.value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => props.onPick(option.id)}
              style={{
                height: "34px",
                margin: 0,
                padding: "0 14px",
                border: 0,
                borderRadius: "8px",
                font: "inherit",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                ...(on
                  ? {
                      background: color.white,
                      color: color.ink,
                      boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
                    }
                  : { background: "transparent", color: color.muted }),
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LaterRow(props: { title: string; desc: string }) {
  return (
    <div class="row">
      <span class="lbl">
        <span class="lt">{props.title}</span>
        <span class="ld">{props.desc}</span>
      </span>
      <span class="soon">{t("settings.comingLater")}</span>
    </div>
  );
}

/** How far below the top of the window a section's top counts as "in view". */
const IN_VIEW_LINE = 120;

/**
 * The section in view: the last one whose top has passed a line near the top of the
 * window; the last section once the page is scrolled to the bottom.
 */
function useSectionInView(): SectionId {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id);
  useEffect(() => {
    const update = () => {
      const line = IN_VIEW_LINE;
      let current: SectionId = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      const atBottom =
        innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && scrollY > 0) current = SECTIONS.at(-1)!.id;
      setActive(current);
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, []);
  return active;
}

const HIGHLIGHT_ROWS = [
  {
    id: "new",
    label: "card.chip.new",
    desc: "settings.highlighting.newDesc",
    sample: { boxShadow: "inset 0 -2px 0 #2F6FE4" },
  },
  {
    id: "learning",
    label: "card.chip.learning",
    desc: "settings.highlighting.learningDesc",
    sample: { background: "#D3F1E5", boxShadow: "inset 0 -2px 0 #0F9F7E" },
  },
  {
    id: "known",
    label: "card.chip.known",
    desc: "settings.highlighting.knownDesc",
    sample: { boxShadow: "inset 0 -2px 0 #A3A8B7" },
  },
] as const;

const DICTIONARIES = [
  { id: "cambridge", label: "dictionary.cambridge" },
  { id: "wiktionary", label: "dictionary.wiktionary" },
  { id: "reverso", label: "settings.dictionaries.reverso" },
  { id: "wordreference", label: "dictionary.wordreference" },
] as const;

const POSITIONS = [
  {
    id: "inVideo",
    label: "settings.video.inVideo",
    desc: "settings.video.inVideoDesc",
    bar: { bottom: "10px" },
  },
  {
    id: "belowVideo",
    label: "settings.video.belowVideo",
    desc: "settings.video.belowVideoDesc",
    bar: { bottom: "-16px" },
  },
] as const;

const SITES = [
  {
    id: "youtube",
    label: "platform.youtube",
    desc: "settings.sites.youtubeDesc",
  },
  {
    id: "netflix",
    label: "platform.netflix",
    desc: "settings.sites.netflixDesc",
  },
  {
    id: "articles",
    label: "settings.sites.articles",
    desc: "settings.sites.articlesDesc",
  },
] as const;

/** "Never run on": the hosts as chips, each removable, and an inline field to add one. */
function NeverRunOn(props: {
  sites: readonly string[];
  onChange: (sites: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  function close() {
    setAdding(false);
    setText("");
    setInvalid(false);
  }

  function add() {
    const site = siteFromInput(text);
    if (!site) {
      setInvalid(true);
      return;
    }
    if (!props.sites.includes(site)) props.onChange([...props.sites, site]);
    close();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "14px", fontWeight: 600 }}>
        {t("settings.sites.never")}
      </span>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {props.sites.map((site) => (
          <span
            key={site}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              height: "32px",
              padding: "0 4px 0 12px",
              borderRadius: "999px",
              background: color.surfaceGray,
              fontSize: "13px",
            }}
          >
            {site}
            <button
              type="button"
              aria-label={t("settings.sites.remove", { site })}
              onClick={() =>
                props.onChange(props.sites.filter((s) => s !== site))
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                border: 0,
                borderRadius: "12px",
                background: "none",
                color: color.ink3,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18"></path>
              </svg>
            </button>
          </span>
        ))}
        {adding ? (
          <span style={{ display: "inline-flex", gap: "8px" }}>
            <input
              ref={input}
              type="text"
              aria-label={t("settings.sites.addInput")}
              aria-invalid={invalid}
              placeholder="example.com"
              value={text}
              onInput={(e) => {
                setText(e.currentTarget.value);
                setInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                else if (e.key === "Escape") close();
              }}
              style={{
                height: "32px",
                width: "200px",
                boxSizing: "border-box",
                padding: "0 12px",
                border: `1px solid ${invalid ? "#B42318" : color.lineStrong}`,
                borderRadius: "999px",
                font: "inherit",
                fontSize: "13px",
                color: color.ink,
              }}
            />
            <button
              class="btn"
              type="button"
              onClick={add}
              style={{ height: "32px", fontSize: "13px" }}
            >
              {t("settings.sites.addConfirm")}
            </button>
          </span>
        ) : (
          <button
            class="btn"
            type="button"
            onClick={() => setAdding(true)}
            style={{ height: "32px", fontSize: "13px", borderStyle: "dashed" }}
          >
            {t("settings.sites.add")}
          </button>
        )}
      </div>
      {invalid && (
        <span role="alert" style={{ fontSize: "13px", color: "#B42318" }}>
          {t("settings.sites.invalid")}
        </span>
      )}
    </div>
  );
}

const UNSAVED_AT_END: readonly {
  id: Settings["unsavedAtEnd"];
  label: MessageKey;
}[] = [
  { id: "keep", label: "settings.highlighting.keepNew" },
  { id: "known", label: "settings.highlighting.markKnown" },
];

/** The settings page (mock Settings): every section, bound to the settings live. */
export function SettingsPage({ deps }: { deps: SettingsDeps }) {
  const { env } = deps;
  const [settings, setSettings] = useState<Settings>();
  const [level, setLevel] = useState<number>();
  const [sync, setSync] = useState<SyncStatus>();
  const [history, setHistory] = useState<HistoryStatus>();
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  const [now, setNow] = useState(deps.now);
  const active = useSectionInView();

  const warn = (error: unknown) => console.warn("Lingo:", error);
  const refreshSync = () =>
    deps.send({ type: "syncStatus" }).then(setSync, warn);
  const refreshHistory = () =>
    deps.send({ type: "historyStatus" }).then(setHistory, warn);
  const refreshLastExport = () =>
    deps.send({ type: "lastExport" }).then(setLastExport, warn);

  function show(next: Settings) {
    setSettings(next);
    setLevel(next.knownLevel);
  }

  useEffect(() => {
    deps.send({ type: "getSettings" }).then(show, warn);
    void refreshSync();
    void refreshHistory();
    void refreshLastExport();
    const unwatch = deps.watchSettings((next) => {
      show(next);
      void refreshSync();
    });
    const timer = setInterval(() => {
      setNow(deps.now());
      void refreshSync();
      void refreshHistory();
    }, deps.refreshMs);
    return () => {
      unwatch();
      clearInterval(timer);
    };
  }, []);

  if (!settings) return null;
  const s = settings;

  function patch(change: SettingsPatch, local: Settings) {
    setSettings(local);
    deps.send({ type: "setSettings", patch: change }).then((next) => {
      show(next);
      if ("syncEnabled" in change) void refreshSync();
    }, warn);
  }

  function flip<G extends "highlight" | "dictionaries" | "sites">(
    group: G,
    key: keyof Settings[G],
  ) {
    const on = !(s[group] as Record<string, boolean>)[key as string];
    patch({ [group]: { [key]: on } } as SettingsPatch, {
      ...s,
      [group]: { ...s[group], [key]: on },
    });
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    patch({ [key]: value } as SettingsPatch, { ...s, [key]: value });
  }

  /** A new learning language comes with a native language it has a dictionary into. */
  function setLanguage(
    key: "learningLang" | "nativeLang" | "uiLocale",
    value: string,
  ) {
    if (key !== "learningLang") return set(key, value);
    const change = {
      learningLang: value,
      nativeLang: nativeLanguages(value)[0] ?? s.nativeLang,
    };
    patch(change, { ...s, ...change });
  }

  const languageSelect = (
    id: string,
    title: MessageKey,
    desc: MessageKey,
    key: "learningLang" | "nativeLang" | "uiLocale",
    options: readonly string[],
  ) => (
    <div class="row">
      <label class="lbl" for={id}>
        <span class="lt">{t(title)}</span>
        <span class="ld">{t(desc)}</span>
      </label>
      <select
        id={id}
        class="sel"
        value={s[key]}
        onChange={(e) => setLanguage(key, e.currentTarget.value)}
      >
        {options.map((code) => (
          <option key={code} value={code}>
            {languageOption(code)}
          </option>
        ))}
      </select>
    </div>
  );

  const shownLevel = level ?? s.knownLevel;
  const used = sync ? kilobytes(sync.bytesUsed) : 0;
  const quota = sync ? kilobytes(sync.quotaBytes) : 0;
  const share = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const historyShare =
    history && history.cap > 0 && history.bytes > 0
      ? Math.min(100, Math.max(1, (history.bytes / history.cap) * 100))
      : 0;
  const clearHistory = () =>
    deps.send({ type: "clearHistory" }).then(refreshHistory, warn);
  const syncLine = !sync
    ? ""
    : !sync.enabled
      ? t("settings.sync.off")
      : sync.lastSavedAt !== undefined
        ? t("settings.sync.lastSaved", {
            when: relativeTime(sync.lastSavedAt, now),
          })
        : t("settings.sync.notSaved");

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        gap: "40px",
        padding: "40px 120px",
        background: color.surface,
        color: color.ink,
        fontFamily: FONT,
      }}
    >
      <style>{CSS}</style>
      <nav
        aria-label={t("settings.navLabel")}
        style={{
          width: "220px",
          flex: "none",
          alignSelf: "flex-start",
          position: "sticky",
          top: "40px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 12px 20px",
          }}
        >
          <span style={badge(32, 9, 16)}>L</span>
          <span style={{ fontSize: "18px", fontWeight: 700 }}>
            {t("settings.title")}
          </span>
        </div>
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            class="nav"
            href={`#${section.id}`}
            aria-current={active === section.id ? "true" : undefined}
          >
            {t(section.label)}
          </a>
        ))}
      </nav>

      <main
        style={{
          flex: 1,
          maxWidth: "800px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <Section
          id="languages"
          label="settings.section.languages"
          lead={t("settings.languages.lead")}
        >
          {languageSelect(
            "lang-learn",
            "settings.languages.learning",
            "settings.languages.learningDesc",
            "learningLang",
            learningLanguages(),
          )}
          {languageSelect(
            "lang-native",
            "settings.languages.native",
            "settings.languages.nativeDesc",
            "nativeLang",
            nativeLanguages(s.learningLang),
          )}
          {languageSelect(
            "lang-ui",
            "settings.languages.ui",
            "settings.languages.uiDesc",
            "uiLocale",
            ["en"],
          )}
        </Section>

        <Section
          id="level"
          label="settings.section.level"
          lead={t("settings.level.lead")}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <label
              for="level-range"
              style={{ fontSize: "15px", fontWeight: 600 }}
            >
              {t("settings.level.label", {
                count: fmt(shownLevel),
                language: languageName(s.learningLang),
              })}
            </label>
            <input
              id="level-range"
              type="range"
              min={KNOWN_LEVEL_MIN}
              max={KNOWN_LEVEL_MAX}
              step={KNOWN_LEVEL_STEP}
              value={shownLevel}
              onInput={(e) => setLevel(Number(e.currentTarget.value))}
              onChange={(e) => set("knownLevel", Number(e.currentTarget.value))}
              style={{ width: "100%", accentColor: color.green }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: color.muted,
              }}
            >
              <span>
                {t("settings.level.min", { count: fmt(KNOWN_LEVEL_MIN) })}
              </span>
              <span>
                {t("settings.level.max", { count: fmt(KNOWN_LEVEL_MAX) })}
              </span>
            </div>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              lineHeight: 1.5,
              color: color.muted,
            }}
          >
            {t("settings.level.note")}
          </p>
        </Section>

        <Section
          id="highlighting"
          label="settings.section.highlighting"
          lead={t("settings.highlighting.lead")}
        >
          {HIGHLIGHT_ROWS.map((row) => (
            <SwitchRow
              key={row.id}
              title={t(row.label)}
              desc={t(row.desc)}
              label={t("settings.highlighting.switch", {
                category: t(row.label),
              })}
              checked={s.highlight[row.id]}
              onToggle={() => flip("highlight", row.id)}
              before={
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: "72px",
                    textAlign: "center",
                    fontFamily: "Georgia, serif",
                    fontSize: "17px",
                    padding: "2px 0",
                    borderRadius: "4px",
                    ...row.sample,
                  }}
                >
                  {t("settings.highlighting.sample")}
                </span>
              }
            />
          ))}
          <ChoiceRow
            title={t("settings.highlighting.unsavedAtEnd")}
            desc={t("settings.highlighting.unsavedAtEndDesc")}
            options={UNSAVED_AT_END.map((o) => ({ ...o, label: t(o.label) }))}
            value={s.unsavedAtEnd}
            onPick={(id) => set("unsavedAtEnd", id)}
          />
        </Section>

        <Section
          id="dictionaries"
          label="settings.section.dictionaries"
          lead={t("settings.dictionaries.lead")}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "10px 24px",
            }}
          >
            {DICTIONARIES.map((d) => (
              <label
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "14px",
                }}
              >
                <input
                  class="chk"
                  type="checkbox"
                  checked={s.dictionaries[d.id]}
                  onChange={() => flip("dictionaries", d.id)}
                />
                {t(d.label)}
              </label>
            ))}
          </div>
          <LaterRow
            title={t("settings.ai.title")}
            desc={
              env.features.builtInAi
                ? t("settings.ai.descBuiltIn", { browser: env.name })
                : t("settings.ai.desc")
            }
          />
        </Section>

        <Section
          id="video"
          label="settings.section.video"
          lead={t("settings.video.lead")}
        >
          <div
            role="group"
            aria-label={t("settings.video.position")}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            {POSITIONS.map((p) => {
              const on = s.subtitlePosition === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("subtitlePosition", p.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "6px",
                    padding: "16px",
                    margin: 0,
                    borderRadius: "12px",
                    font: "inherit",
                    color: color.ink,
                    textAlign: "left",
                    cursor: "pointer",
                    ...(on
                      ? {
                          background: color.greenPale,
                          border: `2px solid ${color.green}`,
                        }
                      : {
                          background: color.white,
                          border: `2px solid ${color.line}`,
                        }),
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "relative",
                      display: "block",
                      width: "160px",
                      height: "90px",
                      marginBottom: "18px",
                      borderRadius: "6px",
                      background: color.ink,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "30px",
                        right: "30px",
                        height: "10px",
                        borderRadius: "3px",
                        background: on ? "#6FE3C3" : "#C9CDD6",
                        ...p.bar,
                      }}
                    ></span>
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 600 }}>
                    {t(p.label)}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      lineHeight: 1.45,
                      color: color.muted,
                    }}
                  >
                    {t(p.desc)}
                  </span>
                </button>
              );
            })}
          </div>
          <SwitchRow
            title={t("settings.video.subtitleTranslation")}
            desc={t("settings.video.subtitleTranslationDesc")}
            checked={s.subtitleTranslation}
            onToggle={() => set("subtitleTranslation", !s.subtitleTranslation)}
          />
          <SwitchRow
            title={t("settings.video.transcriptTranslation")}
            desc={t("settings.video.transcriptTranslationDesc")}
            checked={s.transcriptTranslation}
            onToggle={() =>
              set("transcriptTranslation", !s.transcriptTranslation)
            }
          />
        </Section>

        <Section
          id="sites"
          label="settings.section.sites"
          lead={t("settings.sites.lead")}
        >
          {SITES.map((site) => (
            <SwitchRow
              key={site.id}
              title={t(site.label)}
              desc={t(site.desc)}
              label={t("settings.sites.switch", { site: t(site.label) })}
              checked={s.sites[site.id]}
              onToggle={() => flip("sites", site.id)}
            />
          ))}
          <NeverRunOn
            sites={s.neverRunOn}
            onChange={(neverRunOn) => set("neverRunOn", neverRunOn)}
          />
        </Section>

        <Section
          id="history"
          label="settings.section.history"
          lead={t("settings.history.lead")}
        >
          <SwitchRow
            title={t("settings.history.switch")}
            desc={t("settings.history.switchDesc")}
            checked={s.sentenceHistory}
            onToggle={() => set("sentenceHistory", !s.sentenceHistory)}
          />
          <div
            class="row"
            style={{
              flexDirection: "column",
              alignItems: "stretch",
              gap: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {t("settings.history.space")}
              </span>
              <span style={{ color: color.ink3 }}>
                {history &&
                  t("settings.history.spaceUsed", {
                    used: megabytes(history.bytes),
                    cap: megabytes(history.cap),
                  })}
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{
                height: "6px",
                borderRadius: "3px",
                background: color.line,
              }}
            >
              <div
                style={{
                  width: `${historyShare}%`,
                  height: "100%",
                  borderRadius: "3px",
                  background: "#0F9F7E",
                }}
              ></div>
            </div>
            <span style={{ fontSize: "13px", color: color.muted }}>
              {history &&
                (history.pages === 0
                  ? t("settings.history.empty")
                  : history.pages === 1
                    ? t("settings.history.onePage")
                    : t("settings.history.pages", {
                        count: fmt(history.pages),
                      }))}
            </span>
          </div>
          <div class="row">
            <span class="lbl">
              <span class="lt">{t("settings.history.clear")}</span>
              <span class="ld">{t("settings.history.clearDesc")}</span>
            </span>
            <button class="btn" type="button" onClick={clearHistory}>
              {t("settings.history.clearButton")}
            </button>
          </div>
        </Section>

        <Section
          id="sync"
          label="settings.section.sync"
          lead={t("settings.sync.lead", { syncName: env.syncName })}
        >
          <SwitchRow
            first
            title={t("settings.sync.switch", { syncName: env.syncName })}
            desc={t("settings.sync.switchDesc", { browser: env.name })}
            checked={s.syncEnabled}
            onToggle={() => set("syncEnabled", !s.syncEnabled)}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "14px",
              borderRadius: "10px",
              background: color.surface,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {t("settings.sync.space")}
              </span>
              <span>{t("settings.sync.spaceUsed", { used, quota })}</span>
            </div>
            <div
              aria-hidden="true"
              style={{
                height: "8px",
                borderRadius: "4px",
                background: color.line,
              }}
            >
              <div
                style={{
                  width: `${share}%`,
                  height: "100%",
                  borderRadius: "4px",
                  background: "#0F9F7E",
                }}
              ></div>
            </div>
            <span style={{ fontSize: "12px", color: color.muted }}>
              {syncLine}
            </span>
          </div>
          <div class="row">
            <span class="lbl">
              <span class="lt">{t("settings.backup.title")}</span>
              <span class="ld">
                {t("settings.backup.desc")}{" "}
                {lastExport === null
                  ? t("settings.backup.never")
                  : t("settings.backup.lastExport", {
                      when: relativeTime(lastExport, now),
                    })}
              </span>
              {note && (
                <span
                  role="status"
                  style={{
                    fontSize: "13px",
                    lineHeight: 1.45,
                    color: note.ok ? color.greenDark : "#B42318",
                  }}
                >
                  {note.text}
                </span>
              )}
            </span>
            <BackupButtons
              deps={deps}
              class="btn"
              onNote={setNote}
              onExported={() => {
                setNow(deps.now());
                void refreshLastExport();
              }}
            />
          </div>
          <LaterRow
            title={t("settings.cloud.title")}
            desc={
              env.features.fileSystemAccess
                ? t("settings.cloud.desc", { syncName: env.syncName })
                : t("settings.cloud.descNoFolder", { syncName: env.syncName })
            }
          />
        </Section>

        <Section id="about" label="settings.section.about" gap="8px">
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.6,
              color: color.ink3,
            }}
          >
            {t("settings.about.line", { version: deps.version })}
          </p>
        </Section>
      </main>
    </div>
  );
}
