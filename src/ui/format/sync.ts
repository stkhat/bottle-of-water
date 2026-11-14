import { t } from "../../i18n/t";
import type { SyncStatus } from "../../messaging/protocol";
import { kilobytes } from "./format";

/** The synced data's room in whole KB, and the share used (0–100) for a `Meter`. */
export function syncSpace(
  status: Pick<SyncStatus, "bytesUsed" | "quotaBytes"> | undefined,
) {
  const used = status ? kilobytes(status.bytesUsed) : 0;
  const quota = status ? kilobytes(status.quotaBytes) : 0;
  return {
    used,
    quota,
    share: quota > 0 ? Math.min(100, (used / quota) * 100) : 0,
  };
}

/** "Sync is off", the line `saved` gives for the last save, or "Not saved yet". */
export function syncSavedLine(
  status: Pick<SyncStatus, "enabled" | "lastSavedAt">,
  saved: (lastSavedAt: number) => string,
): string {
  if (!status.enabled) return t("sync.off");
  return status.lastSavedAt !== undefined
    ? saved(status.lastSavedAt)
    : t("sync.notSaved");
}
