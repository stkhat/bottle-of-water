import { useEffect, useState } from "preact/hooks";
import type { Counts } from "../../background/term-store";
import { onHost } from "../../content/article/should-run";
import type { Settings, SettingsPatch } from "../../core/settings";
import type { SyncStatus } from "../../core/sync/backend";
import { t } from "../../i18n/t";
import type { send } from "../../messaging/client";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import { kilobytes, relativeTime } from "../../ui/format/format";
import { HighlightChips } from "../../ui/lookup/HighlightChips";
import { SaveAll } from "../../ui/lookup/SaveAll";
import { Switch } from "../../ui/lookup/Switch";
import { badge, color, FONT } from "../../ui/lookup/styles";

/** What the popup works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface PopupDeps {
  send: typeof send;
  /** Asks the active tab's content script; undefined when nothing there answers. */
  askPage(request: PageRequest): Promise<PageSummary | undefined>;
  watchSettings(listener: (settings: Settings) => void): () => void;
  /** `BrowserEnv.syncName`, e.g. "Chrome sync". */
  syncName: string;
  openOptions(): void;
  openWordList(): void;
  now(): number;
  /** How often the tab, the counts and the sync status are asked again while open. */
  refreshMs: number;
}

/** The page summary: still asking, nothing answered, or the answer. */
type PageState = "asking" | "none" | PageSummary;

const CHECK = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color.green}
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    style={{ flex: "none" }}
  >
    <path d="M5 12l5 5 9-10"></path>
  </svg>
);

const fmt = (n: number) => n.toLocaleString("en-US");

function CountTile(props: { value: number; label: string; green?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "10px",
        borderRadius: "10px",
        background: props.green ? color.greenPale : color.surfaceGray,
      }}
    >
      <span
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: props.green ? color.greenDark : color.ink,
        }}
      >
        {fmt(props.value)}
      </span>
      <span style={{ fontSize: "12px", color: color.ink2 }}>{props.label}</span>
    </div>
  );
}

function SyncLine(props: {
  status: SyncStatus;
  syncName: string;
  now: number;
}) {
  const { status } = props;
  if (!status.enabled)
    return <span style={{ fontSize: "13px" }}>{t("popup.sync.off")}</span>;
  const used = kilobytes(status.bytesUsed);
  const quota = kilobytes(status.quotaBytes);
  const share = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
        }}
      >
        {status.lastSavedAt !== undefined && CHECK}
        <span>
          {status.lastSavedAt !== undefined
            ? t("popup.sync.saved", {
                syncName: props.syncName,
                when: relativeTime(status.lastSavedAt, props.now),
              })
            : t("popup.sync.notSaved")}
        </span>
      </div>
      <div
        aria-hidden="true"
        style={{ height: "6px", borderRadius: "3px", background: color.line }}
      >
        <div
          style={{
            width: `${share}%`,
            height: "100%",
            borderRadius: "3px",
            background: "#0F9F7E",
          }}
        ></div>
      </div>
      <span style={{ fontSize: "12px", color: color.muted }}>
        {t("popup.sync.space", { used, quota })}
      </span>
    </>
  );
}

const footerButton = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "40px",
  margin: 0,
  padding: 0,
  borderRadius: "8px",
  font: "inherit",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
} as const;

/** The toolbar popup (mock Toolbar): this site, highlights, counts, this page, sync. */
export function Popup({ deps }: { deps: PopupDeps }) {
  const [settings, setSettings] = useState<Settings>();
  const [counts, setCounts] = useState<Counts>();
  const [page, setPage] = useState<PageState>("asking");
  const [sync, setSync] = useState<SyncStatus>();
  const [now, setNow] = useState(deps.now);

  const warn = (error: unknown) => console.warn("Lingo:", error);

  function refreshCounts(lang: string) {
    deps.send({ type: "counts", lang }).then(setCounts, warn);
  }

  function askPage(request: PageRequest) {
    return deps.askPage(request).then(
      (summary) => setPage(summary ?? "none"),
      () => setPage("none"),
    );
  }

  useEffect(() => {
    let lang: string | undefined;
    const refresh = () => {
      setNow(deps.now());
      void askPage({ type: "pageSummary" });
      deps.send({ type: "syncStatus" }).then(setSync, warn);
      if (lang) refreshCounts(lang);
    };
    deps.send({ type: "getSettings" }).then((s) => {
      lang = s.learningLang;
      setSettings(s);
      refreshCounts(lang);
    }, warn);
    refresh();
    const unwatch = deps.watchSettings((s) => {
      lang = s.learningLang;
      setSettings(s);
    });
    const timer = setInterval(refresh, deps.refreshMs);
    return () => {
      unwatch();
      clearInterval(timer);
    };
  }, []);

  function patch(change: SettingsPatch) {
    deps.send({ type: "setSettings", patch: change }).then(setSettings, warn);
  }

  const summary = typeof page === "object" ? page : undefined;
  const siteOn =
    settings && summary
      ? !settings.disabledSites.some((e) => onHost(summary.hostname, e))
      : true;

  function toggleSite() {
    if (!settings || !summary) return;
    const { hostname } = summary;
    const disabledSites = siteOn
      ? [...settings.disabledSites, hostname]
      : settings.disabledSites.filter((e) => !onHost(hostname, e));
    setSettings({ ...settings, disabledSites });
    patch({ disabledSites });
  }

  function pageAction(request: PageRequest) {
    void askPage(request).then(() => {
      if (settings) refreshCounts(settings.learningLang);
    });
  }

  return (
    <div
      role="dialog"
      aria-label={t("app.name")}
      style={{
        width: "360px",
        boxSizing: "border-box",
        background: color.white,
        color: color.ink,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 8px 12px 16px",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <span style={badge(28, 8, 14)}>L</span>
        <span style={{ fontWeight: 700, fontSize: "15px" }}>
          {t("app.name")}
        </span>
        <span style={{ fontSize: "13px", color: color.muted }}>
          {t("app.languagePair")}
        </span>
        <span style={{ flex: 1 }}></span>
        <button
          type="button"
          aria-label={t("popup.openSettings")}
          onClick={deps.openOptions}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            color: color.ink3,
            border: 0,
            background: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path>
          </svg>
        </button>
      </div>

      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {summary && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 600 }}>
                {t("popup.site")}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: color.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {summary.hostname}
              </span>
            </div>
            <Switch
              size="large"
              checked={siteOn}
              label={t("popup.siteSwitch")}
              onToggle={toggleSite}
            />
          </div>
        )}

        {settings && (
          <HighlightChips
            look="popup"
            highlight={settings.highlight}
            onToggle={(category) => {
              const on = !settings.highlight[category];
              setSettings({
                ...settings,
                highlight: { ...settings.highlight, [category]: on },
              });
              patch({ highlight: { [category]: on } });
            }}
          />
        )}

        {counts && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            <CountTile
              value={counts.learning}
              label={t("popup.count.learning")}
              green
            />
            <CountTile value={counts.known} label={t("popup.count.known")} />
            <CountTile
              value={counts.phrases}
              label={t("popup.count.phrases")}
            />
          </div>
        )}

        {summary?.supported && siteOn && (
          <SaveAll
            scope={summary.scope}
            unsavedCount={summary.unsaved}
            done={summary.done}
            cardNote={false}
            onAddLearning={() =>
              pageAction({ type: "pageSaveAll", status: "learning" })
            }
            onMarkKnown={() =>
              pageAction({ type: "pageSaveAll", status: "known" })
            }
            onUndo={() => pageAction({ type: "pageUndo" })}
          />
        )}

        {sync && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SyncLine status={sync} syncName={deps.syncName} now={now} />
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "8px",
          padding: "12px 16px 16px",
          borderTop: `1px solid ${color.line}`,
        }}
      >
        <button
          type="button"
          onClick={deps.openWordList}
          style={{
            ...footerButton,
            border: `1px solid ${color.lineStrong}`,
            background: color.white,
            color: color.ink,
          }}
        >
          {t("popup.wordList")}
        </button>
        <button
          type="button"
          onClick={deps.openOptions}
          style={{
            ...footerButton,
            border: 0,
            background: color.green,
            color: color.white,
          }}
        >
          {t("popup.settings")}
        </button>
      </div>
    </div>
  );
}
