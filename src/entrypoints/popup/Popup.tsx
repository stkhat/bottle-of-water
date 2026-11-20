import { useEffect, useState } from "preact/hooks";
import type { Counts, SyncStatus } from "../../messaging/protocol";
import { onHost } from "../../core/url";
import type { DataNote } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import type { Settings, SettingsPatch } from "../../core/settings";
import { languageName, languagePair } from "../../i18n/languages";
import { t } from "../../i18n/t";
import {
  followPackStatus,
  pairNote,
  type PackStatusDeps,
} from "../../messaging/pack-status";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import { BrandHeader } from "../../ui/BrandHeader";
import { fmt, relativeTime } from "../../ui/format/format";
import { syncSavedLine, syncSpace } from "../../ui/format/sync";
import { CheckIcon, GearIcon, WordListIcon } from "../../ui/icons";
import { HighlightChips } from "../../ui/lookup/HighlightChips";
import { Meter } from "../../ui/Meter";
import { LanguageDataNote } from "../../ui/packs/LanguageDataNote";
import { color, FONT } from "../../ui/styles";
import { Switch } from "../../ui/Switch";
import { SaveAll } from "./SaveAll";
import { RATE_NUDGE_AT, RateNudge, SupportNav } from "./Support";

/** What the popup works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface PopupDeps extends PackStatusDeps {
  /** Asks the active tab's content script; undefined when nothing there answers. */
  askPage(request: PageRequest): Promise<PageSummary | undefined>;
  /** `BrowserEnv.syncName`, e.g. "Chrome sync". */
  syncName: string;
  /** Where the footer's links lead; an empty one is left out. */
  links: SupportLinks;
  /** Opens a link in a new tab (and so closes the popup). */
  openTab(url: string): void;
  openOptions(): void;
  openWordList(): void;
  /** Closes the popup. */
  close(): void;
  now(): number;
  /** How often the tab, the counts and the sync status are asked again while open. */
  refreshMs: number;
}

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
  const line = syncSavedLine(status, (lastSavedAt) =>
    t("popup.sync.saved", {
      syncName: props.syncName,
      when: relativeTime(lastSavedAt, props.now),
    }),
  );
  if (!status.enabled) return <span style={{ fontSize: "13px" }}>{line}</span>;
  const { used, quota, share } = syncSpace(status);
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
        {status.lastSavedAt !== undefined && <CheckIcon />}
        <span>{line}</span>
      </div>
      <Meter share={share} />
      <span style={{ fontSize: "12px", color: color.muted }}>
        {t("popup.sync.space", { used, quota })}
      </span>
    </>
  );
}

/** The header's icon buttons (word list, settings). */
const headerButton = {
  flex: "none",
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
} as const;

/**
 * The toolbar popup (mock Toolbar): the header's switch for Langle as a whole, the
 * language data while it is missing (mock LanguageData), this site, this page,
 * highlights, counts, sync, the rating nudge and the Support Langle footer. While Langle
 * is switched off, only the header, sync and the footer.
 */
export function Popup({ deps }: { deps: PopupDeps }) {
  const [settings, setSettings] = useState<Settings>();
  const [counts, setCounts] = useState<Counts>();
  /** The active tab's summary; none while asking, or when nothing there answers. */
  const [summary, setSummary] = useState<PageSummary>();
  const [sync, setSync] = useState<SyncStatus>();
  const [data, setData] = useState<DataNote | null>(null);
  const [now, setNow] = useState(deps.now);

  const warn = (error: unknown) => console.warn("Langle:", error);

  function refreshCounts(lang: string) {
    deps.send({ type: "counts", lang }).then(setCounts, warn);
  }

  function askPage(request: PageRequest) {
    return deps.askPage(request).then(setSummary, () => setSummary(undefined));
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
    const packs = followPackStatus(deps, (status) => setData(pairNote(status)));
    const unwatch = deps.watchSettings((s) => {
      lang = s.learningLang;
      setSettings(s);
    });
    const timer = setInterval(refresh, deps.refreshMs);
    return () => {
      unwatch();
      packs.stop();
      clearInterval(timer);
    };
  }, []);

  function patch(change: SettingsPatch) {
    deps.send({ type: "setSettings", patch: change }).then(setSettings, warn);
  }

  /** Shows `local` at once and stores `change` (the same change, as a patch). */
  function update(local: Partial<Settings>, change: SettingsPatch) {
    if (!settings) return;
    setSettings({ ...settings, ...local });
    patch(change);
  }

  /** Langle runs at all (the header's switch); while off only the header and sync show. */
  const langleOn = settings?.enabled !== false;

  function toggleLangle() {
    if (!settings) return;
    const enabled = !settings.enabled;
    update({ enabled }, { enabled });
  }

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
    update({ disabledSites }, { disabledSites });
  }

  /** The nudge shows once Learning reaches 100 words, until Rate or × answers it. */
  const nudging =
    !!deps.links.review &&
    settings?.rateNudgeDone === false &&
    (counts?.learning ?? 0) >= RATE_NUDGE_AT;

  /** Stores that the nudge was answered, everywhere (the setting syncs). */
  function nudgeDone(): Promise<unknown> {
    if (!settings || settings.rateNudgeDone) return Promise.resolve();
    setSettings({ ...settings, rateNudgeDone: true });
    return deps
      .send({ type: "setSettings", patch: { rateNudgeDone: true } })
      .catch(warn);
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
        background: color.card,
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
        <BrandHeader
          size="popup"
          stacked
          title={t("app.name")}
          pair={
            settings
              ? languagePair(settings.learningLang, settings.nativeLang)
              : ""
          }
        />
        <span style={{ flex: 1 }}></span>
        <button
          type="button"
          aria-label={t("wordlist.title")}
          title={t("wordlist.title")}
          onClick={deps.openWordList}
          style={headerButton}
        >
          <WordListIcon size={20} />
        </button>
        <button
          type="button"
          aria-label={t("action.openSettings")}
          title={t("action.openSettings")}
          onClick={deps.openOptions}
          style={headerButton}
        >
          <GearIcon size={20} />
        </button>
        {settings && (
          <span style={{ display: "flex", padding: "0 8px 0 4px" }}>
            <Switch
              size="large"
              checked={langleOn}
              label={t("popup.langleSwitch")}
              onToggle={toggleLangle}
            />
          </span>
        )}
      </div>

      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {langleOn && data && settings && (
          <LanguageDataNote
            note={data}
            language={languageName(settings.learningLang)}
            onRetry={() => {
              deps.send({ type: "retryPacks" }).catch(warn);
            }}
          />
        )}

        {langleOn && summary && (
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

        {langleOn && summary?.supported && siteOn && (
          <SaveAll
            scope={summary.scope}
            unsavedCount={summary.unsaved}
            done={summary.done}
            onAddLearning={() =>
              pageAction({ type: "pageSaveAll", status: "learning" })
            }
            onMarkKnown={() =>
              pageAction({ type: "pageSaveAll", status: "known" })
            }
            onUndo={() => pageAction({ type: "pageUndo" })}
            {...(summary.scope === "page" && {
              onShowWords() {
                void deps
                  .askPage({ type: "pageShowWords" })
                  .catch(warn)
                  .finally(deps.close);
              },
            })}
          />
        )}

        {langleOn && settings && (
          <HighlightChips
            look="popup"
            highlight={settings.highlight}
            onToggle={(category) => {
              const on = !settings.highlight[category];
              update(
                { highlight: { ...settings.highlight, [category]: on } },
                { highlight: { [category]: on } },
              );
            }}
          />
        )}

        {langleOn && counts && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            <CountTile
              value={counts.learning}
              label={t("status.learning")}
              green
            />
            <CountTile value={counts.known} label={t("status.known")} />
            <CountTile value={counts.phrases} label={t("kind.phrases")} />
          </div>
        )}

        {sync && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SyncLine status={sync} syncName={deps.syncName} now={now} />
          </div>
        )}

        {nudging && <RateNudge onDismiss={() => void nudgeDone()} />}
      </div>

      <SupportNav
        reviewUrl={deps.links.review}
        coffeeUrl={deps.links.coffee}
        nudging={nudging}
        onRate={() =>
          // Stored first: opening a tab closes the popup.
          void nudgeDone().finally(() => deps.openTab(deps.links.review))
        }
        onOpen={deps.openTab}
      />
    </div>
  );
}
