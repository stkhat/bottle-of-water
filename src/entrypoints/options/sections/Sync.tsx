import { useEffect, useState } from "preact/hooks";
import type { BrowserEnv } from "../../../core/browser-env";
import { t } from "../../../i18n/t";
import type { SyncStatus } from "../../../messaging/protocol";
import {
  BackupButtons,
  BackupStatus,
  type BackupDeps,
  type BackupNote,
} from "../../../ui/backup/BackupButtons";
import { kilobytes, relativeTime } from "../../../ui/format/format";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { LaterRow, Section, SwitchRow, type SectionProps } from "../rows";

function syncLine(sync: SyncStatus | undefined, now: number): string {
  if (!sync) return "";
  if (!sync.enabled) return t("sync.off");
  return sync.lastSavedAt !== undefined
    ? t("settings.sync.lastSaved", {
        when: relativeTime(sync.lastSavedAt, now),
      })
    : t("sync.notSaved");
}

export function SyncSection(
  props: SectionProps & {
    deps: BackupDeps;
    env: Pick<BrowserEnv, "name" | "syncName" | "features">;
    sync: SyncStatus | undefined;
    now: number;
    /** An export was downloaded. */
    onExported: () => void;
  },
) {
  const { settings, env, sync, deps } = props;
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  const refreshLastExport = () =>
    deps
      .send({ type: "lastExport" })
      .then(setLastExport, (error: unknown) => console.warn("Lingo:", error));
  useEffect(() => void refreshLastExport(), []);

  const used = sync ? kilobytes(sync.bytesUsed) : 0;
  const quota = sync ? kilobytes(sync.quotaBytes) : 0;
  return (
    <Section
      id="sync"
      label="settings.section.sync"
      lead={t("settings.sync.lead", { syncName: env.syncName })}
    >
      <SwitchRow
        first
        title={t("settings.sync.switch", { syncName: env.syncName })}
        desc={t("settings.sync.switchDesc", { browser: env.name })}
        checked={settings.syncEnabled}
        onToggle={() => props.change({ syncEnabled: !settings.syncEnabled })}
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
          <span style={{ fontWeight: 600 }}>{t("settings.sync.space")}</span>
          <span>{t("settings.sync.spaceUsed", { used, quota })}</span>
        </div>
        <Meter
          share={quota > 0 ? Math.min(100, (used / quota) * 100) : 0}
          height={8}
        />
        <span style={{ fontSize: "12px", color: color.muted }}>
          {syncLine(sync, props.now)}
        </span>
      </div>
      <div class="row">
        <RowLabel
          title={t("settings.backup.title")}
          desc={
            <>
              {t("settings.backup.desc")}{" "}
              {lastExport === null
                ? t("settings.backup.never")
                : t("settings.backup.lastExport", {
                    when: relativeTime(lastExport, props.now),
                  })}
            </>
          }
        >
          <BackupStatus note={note} lineHeight={1.45} />
        </RowLabel>
        <BackupButtons
          deps={deps}
          class="btn"
          onNote={setNote}
          onExported={() => {
            props.onExported();
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
  );
}
