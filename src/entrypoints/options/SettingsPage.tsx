import { useEffect, useRef, useState } from "preact/hooks";
import type { BrowserEnv } from "../../core/browser-env";
import {
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";
import type { send } from "../../messaging/client";
import {
  followPackStatus,
  type PackStatusDeps,
  type PackStatusFollower,
} from "../../messaging/pack-status";
import type {
  HistoryStatus,
  PackStatus,
  SyncStatus,
} from "../../messaging/protocol";
import type { BackupDeps } from "../../ui/backup/BackupButtons";
import { BrandHeader } from "../../ui/BrandHeader";
import { color, FONT } from "../../ui/styles";
import { AboutSection } from "./sections/About";
import { AppearanceSection } from "./sections/Appearance";
import { ArticlesSection } from "./sections/Articles";
import { DictionariesSection } from "./sections/Dictionaries";
import { HighlightingSection } from "./sections/Highlighting";
import { HistorySection } from "./sections/History";
import { LanguagesSection } from "./sections/Languages";
import { LevelSection } from "./sections/Level";
import { SitesSection } from "./sections/Sites";
import { SyncSection } from "./sections/Sync";
import { VideoSection } from "./sections/Video";

/** What the settings page works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface SettingsDeps extends BackupDeps, PackStatusDeps {
  send: typeof send;
  env: Pick<BrowserEnv, "name" | "syncName" | "features">;
  /** The extension's version, from the manifest. */
  version: string;
  /** How often the sync and history status and the relative times are refreshed. */
  refreshMs: number;
}

const SECTIONS = [
  { id: "languages", label: "settings.section.languages" },
  { id: "appearance", label: "settings.section.appearance" },
  { id: "level", label: "settings.section.level" },
  { id: "highlighting", label: "settings.section.highlighting" },
  { id: "dictionaries", label: "settings.section.dictionaries" },
  { id: "video", label: "settings.section.video" },
  { id: "sites", label: "settings.section.sites" },
  { id: "history", label: "settings.section.history" },
  { id: "sync", label: "settings.section.sync" },
  { id: "articles", label: "settings.section.articles" },
  { id: "about", label: "settings.section.about" },
] as const satisfies readonly { id: string; label: MessageKey }[];

type SectionId = (typeof SECTIONS)[number]["id"];

const CSS = `
body{background:${color.surface}}
a{color:${color.greenText}}a:hover{color:${color.greenDark}}
.card{background:${color.card};border:1px solid ${color.line};border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px;scroll-margin-top:24px}
.h2{margin:0;font-size:18px;font-weight:700}
.lead{margin:-10px 0 0;font-size:14px;line-height:1.5;color:${color.muted}}
.row{display:flex;align-items:center;gap:16px;padding:12px 0;border-top:1px solid ${color.soft}}
.sel{height:40px;min-width:220px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:${color.card};color:${color.ink};font:inherit;font-size:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 16px;border-radius:8px;border:1px solid ${color.lineStrong};background:${color.card};color:${color.ink};font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.nav{display:flex;align-items:center;height:40px;padding:0 12px;border-radius:8px;color:${color.ink2};text-decoration:none;font-size:14px}
.nav:hover{background:${color.soft};color:${color.ink}}
.nav[aria-current="true"]{background:${color.greenPale};color:${color.greenDark};font-weight:600}
.chk{width:18px;height:18px;accent-color:${color.green};margin:0}
.soon{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};background:${color.surfaceGray};border-radius:999px;padding:3px 8px}
.sub{display:flex;align-items:center;gap:16px;padding:10px 0 10px 20px;border-top:1px solid ${color.soft}}
.st{display:inline-flex;align-items:center;gap:8px;min-width:220px;justify-content:flex-end;font-size:14px;color:${color.ink}}
`;

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

/** The settings page (mock Settings): every section, bound to the settings live. */
export function SettingsPage({ deps }: { deps: SettingsDeps }) {
  const [settings, setSettings] = useState<Settings>();
  const [sync, setSync] = useState<SyncStatus>();
  const [history, setHistory] = useState<HistoryStatus>();
  const [packs, setPacks] = useState<PackStatus>();
  const [now, setNow] = useState(deps.now);
  const active = useSectionInView();
  const packStatus = useRef<PackStatusFollower>(undefined);

  const warn = (error: unknown) => console.warn("Lingo:", error);
  const refreshSync = () =>
    deps.send({ type: "syncStatus" }).then(setSync, warn);
  const refreshHistory = () =>
    deps.send({ type: "historyStatus" }).then(setHistory, warn);

  useEffect(() => {
    packStatus.current = followPackStatus(deps, setPacks);
    deps.send({ type: "getSettings" }).then(setSettings, warn);
    void refreshSync();
    void refreshHistory();
    const unwatch = deps.watchSettings((next) => {
      setSettings(next);
      void refreshSync();
    });
    const timer = setInterval(() => {
      setNow(deps.now());
      void refreshSync();
      void refreshHistory();
    }, deps.refreshMs);
    return () => {
      unwatch();
      packStatus.current?.stop();
      clearInterval(timer);
    };
  }, []);

  if (!settings) return null;

  function change(patch: SettingsPatch) {
    setSettings(mergeSettings(patch, settings));
    deps.send({ type: "setSettings", patch }).then((next) => {
      setSettings(next);
      if ("syncEnabled" in patch) void refreshSync();
    }, warn);
  }
  const section = { settings, change };

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
          <BrandHeader size="settings" title={t("settings.title")} />
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
        <LanguagesSection
          {...section}
          packs={packs}
          onRetry={() => {
            deps.send({ type: "retryPacks" }).catch(warn);
          }}
          onRemove={(names) => {
            void (async () => {
              for (const pack of names)
                await deps.send({ type: "removePack", pack });
            })()
              .catch(warn)
              .finally(() => packStatus.current?.refresh());
          }}
        />
        <AppearanceSection {...section} />
        <LevelSection {...section} />
        <HighlightingSection {...section} />
        <DictionariesSection {...section} env={deps.env} />
        <VideoSection {...section} />
        <SitesSection {...section} />
        <HistorySection
          {...section}
          history={history}
          onClear={() =>
            void deps.send({ type: "clearHistory" }).then(refreshHistory, warn)
          }
        />
        <SyncSection
          {...section}
          deps={deps}
          env={deps.env}
          sync={sync}
          now={now}
          onExported={() => setNow(deps.now())}
        />
        <ArticlesSection {...section} />
        <AboutSection version={deps.version} />
      </main>
    </div>
  );
}
