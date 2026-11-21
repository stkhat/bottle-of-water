import { useEffect, useState } from "preact/hooks";
import type { CloudProviderId } from "../../../core/cloud/provider";
import type { BrowserEnv } from "../../../core/browser-env";
import { t } from "../../../i18n/t";
import type { CloudStatus, SyncStatus } from "../../../messaging/protocol";
import {
  BackupButtons,
  BackupStatus,
  type BackupDeps,
  type BackupNote,
} from "../../../ui/backup/BackupButtons";
import {
  cloudErrorLine,
  cloudSizeLine,
  type CloudView,
} from "../../../ui/format/cloud";
import { relativeTime } from "../../../ui/format/format";
import { syncSavedLine, syncSpace } from "../../../ui/format/sync";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { LaterRow, Section, SwitchRow, type SectionProps } from "../rows";

/** What the cloud rows ask the background for; resolves once it is done. */
export type CloudRequest =
  | { type: "cloudConnect"; provider: CloudProviderId }
  | { type: "cloudDisconnect" };

function syncLine(sync: SyncStatus | undefined, now: number): string {
  if (!sync) return "";
  return syncSavedLine(sync, (lastSavedAt) =>
    t("settings.sync.lastSaved", { when: relativeTime(lastSavedAt, now) }),
  );
}

/** Mock `.box`: the status under a sync row. */
const BOX = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "14px",
  borderRadius: "10px",
  background: color.surface,
} as const;

/** Mock `.bl`: the box's first line, a title at the left and a figure at the right. */
const BOX_LINE = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  fontSize: "13px",
} as const;

/** Mock `.bs`. */
const BOX_NOTE = { fontSize: "12px", lineHeight: 1.45, color: color.muted };

/** The browser-sync switch and its space, while no cloud storage is connected here. */
function BrowserSyncRows(
  props: SectionProps & {
    env: Pick<BrowserEnv, "name" | "syncName">;
    sync: SyncStatus | undefined;
    now: number;
  },
) {
  const { settings, env, sync } = props;
  const { used, quota, share } = syncSpace(sync);
  return (
    <>
      <SwitchRow
        first
        title={t("settings.sync.switch", { syncName: env.syncName })}
        desc={t("settings.sync.switchDesc", { browser: env.name })}
        checked={settings.syncEnabled}
        onToggle={() => props.change({ syncEnabled: !settings.syncEnabled })}
      />
      <div style={BOX}>
        <div style={BOX_LINE}>
          <span style={{ fontWeight: 600 }}>{t("settings.sync.space")}</span>
          <span>{t("settings.sync.spaceUsed", { used, quota })}</span>
        </div>
        <Meter share={share} height={8} />
        <span style={BOX_NOTE}>{syncLine(sync, props.now)}</span>
      </div>
    </>
  );
}

/** What an error box says under its red line (mock CloudSync's three errors). */
function errorNote(status: CloudStatus, now: number): string {
  const saved =
    status.lastSavedAt === undefined
      ? undefined
      : t("settings.cloud.lastSaved", {
          when: relativeTime(status.lastSavedAt, now),
        });
  const parts =
    status.error === "reconnect"
      ? [saved, t("settings.cloud.reconnectDesc")]
      : status.error === "full"
        ? [saved, t("settings.cloud.fullDesc")]
        : [t("settings.cloud.updateDesc"), saved];
  return parts.filter((part) => part !== undefined).join(" ");
}

/** "Your own cloud storage" while connected: Disconnect (and Reconnect), then the status. */
function ConnectedRows(props: {
  view: Extract<CloudView, { kind: "connected" }>;
  now: number;
  busy: boolean;
  onCloud: (request: CloudRequest) => void;
}) {
  const { view, now } = props;
  const { status } = view;
  const error = cloudErrorLine(status, view.name);
  const saved =
    status.lastSavedAt === undefined
      ? t("sync.notSaved")
      : t("cloud.saved", {
          provider: view.name,
          when: relativeTime(status.lastSavedAt, now),
        });
  return (
    <>
      <div class="row" style={{ borderTop: 0, paddingTop: 0 }}>
        <RowLabel
          title={t("settings.cloud.title")}
          desc={t("settings.cloud.connected", { provider: view.name })}
        />
        {status.error === "reconnect" && (
          <button
            class="btn"
            type="button"
            disabled={props.busy}
            onClick={() =>
              props.onCloud({ type: "cloudConnect", provider: view.provider })
            }
          >
            {t("cloud.reconnect")}
          </button>
        )}
        <button
          class="btn"
          type="button"
          disabled={props.busy}
          onClick={() => props.onCloud({ type: "cloudDisconnect" })}
        >
          {t("cloud.disconnect")}
        </button>
      </div>
      <div style={BOX}>
        <div style={BOX_LINE}>
          {error ? (
            <span style={{ fontWeight: 600, color: color.danger }}>
              {error}
            </span>
          ) : (
            <span style={{ fontWeight: 600 }}>{saved}</span>
          )}
          <span>{cloudSizeLine(status)}</span>
        </div>
        {error ? (
          <span style={BOX_NOTE}>{errorNote(status, now)}</span>
        ) : (
          status.lastCheckedAt !== undefined && (
            <span style={BOX_NOTE}>
              {t("settings.cloud.lastChecked", {
                when: relativeTime(status.lastCheckedAt, now),
              })}
            </span>
          )
        )}
      </div>
    </>
  );
}

/** The last row while not connected here: Connect, "on this device too", or Coming later. */
function ConnectRow(props: {
  view: Exclude<CloudView, { kind: "connected" }>;
  env: Pick<BrowserEnv, "syncName" | "features">;
  busy: boolean;
  onCloud: (request: CloudRequest) => void;
}) {
  const { view, env } = props;
  if (view.kind === "unavailable")
    return (
      <LaterRow
        title={t("settings.cloud.title")}
        desc={
          env.features.fileSystemAccess
            ? t("settings.cloud.desc", { syncName: env.syncName })
            : t("settings.cloud.descNoFolder", { syncName: env.syncName })
        }
      />
    );
  const too = view.kind === "too";
  return (
    <div class="row">
      <RowLabel
        title={
          too
            ? t("cloud.connectToo", { provider: view.name })
            : t("settings.cloud.title")
        }
        desc={
          too
            ? t("settings.cloud.tooDesc", { provider: view.name })
            : t("settings.cloud.offer", {
                provider: view.name,
                syncName: env.syncName,
              })
        }
      />
      <button
        class="btn"
        type="button"
        disabled={props.busy}
        onClick={() =>
          props.onCloud({ type: "cloudConnect", provider: view.provider })
        }
      >
        {too
          ? t("cloud.connect")
          : t("settings.cloud.connectButton", { provider: view.name })}
      </button>
    </div>
  );
}

export function SyncSection(
  props: SectionProps & {
    deps: BackupDeps;
    env: Pick<BrowserEnv, "name" | "syncName" | "features">;
    sync: SyncStatus | undefined;
    /** Undefined until the cloud status is known. */
    cloud: CloudView | undefined;
    /** Connects or disconnects; resolves once the background is done. */
    onCloud: (request: CloudRequest) => Promise<unknown>;
    now: number;
    /** An export was downloaded. */
    onExported: () => void;
  },
) {
  const { env, deps, cloud } = props;
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  const [busy, setBusy] = useState(false);
  const refreshLastExport = () =>
    deps
      .send({ type: "lastExport" })
      .then(setLastExport, (error: unknown) => console.warn("Langle:", error));
  useEffect(() => void refreshLastExport(), []);

  function onCloud(request: CloudRequest) {
    setBusy(true);
    void props.onCloud(request).finally(() => setBusy(false));
  }

  const provider =
    cloud && cloud.kind !== "unavailable" ? cloud.name : undefined;
  return (
    <Section
      id="sync"
      label="settings.section.sync"
      lead={
        provider
          ? t("settings.sync.leadCloud", { syncName: env.syncName, provider })
          : t("settings.sync.lead", { syncName: env.syncName })
      }
    >
      {cloud?.kind === "connected" ? (
        <ConnectedRows
          view={cloud}
          now={props.now}
          busy={busy}
          onCloud={onCloud}
        />
      ) : (
        <BrowserSyncRows
          settings={props.settings}
          change={props.change}
          env={env}
          sync={props.sync}
          now={props.now}
        />
      )}
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
      {cloud && cloud.kind !== "connected" && (
        <ConnectRow view={cloud} env={env} busy={busy} onCloud={onCloud} />
      )}
    </Section>
  );
}
