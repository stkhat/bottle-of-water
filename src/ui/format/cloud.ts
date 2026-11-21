import {
  CLOUD_PROVIDER_NAMES,
  type CloudProviderId,
} from "../../core/cloud/provider";
import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";
import type { CloudStatus } from "../../messaging/protocol";
import { megabytesTenths } from "./format";

/**
 * How the user's own cloud storage stands on this device (mock CloudSync):
 * - `unavailable`: this build can connect to no provider (production for now), so the
 *   row says "Coming later"
 * - `offer`: no device chose a provider; Settings offers "Connect <provider>"
 * - `too`: the synced `cloudProvider` names one this device is not connected to:
 *   "Connect <provider> on this device too"
 * - `connected`: this device syncs through it (`status.error` says what stopped it)
 */
export type CloudView =
  | { kind: "unavailable" }
  | { kind: "offer" | "too"; provider: CloudProviderId; name: string }
  | {
      kind: "connected";
      provider: CloudProviderId;
      name: string;
      status: CloudStatus;
    };

/** Undefined until both the status and the settings are known. */
export function cloudView(
  status: CloudStatus | undefined,
  settings: Pick<Settings, "cloudProvider"> | undefined,
): CloudView | undefined {
  if (!status || !settings) return undefined;
  const named = (provider: CloudProviderId) => ({
    provider,
    name: CLOUD_PROVIDER_NAMES[provider],
  });
  if (status.provider)
    return { kind: "connected", ...named(status.provider), status };
  const chosen = settings.cloudProvider;
  if (chosen !== "none" && status.available.includes(chosen))
    return { kind: "too", ...named(chosen) };
  const first = status.available[0];
  return first ? { kind: "offer", ...named(first) } : { kind: "unavailable" };
}

/** "1.4 MB · 3 devices"; nothing before the first list or write. */
export function cloudSizeLine(
  status: Pick<CloudStatus, "bytes" | "devices">,
): string {
  if (status.devices === 0) return "";
  return t("cloud.size", {
    size: megabytesTenths(status.bytes),
    devices:
      status.devices === 1
        ? t("cloud.oneDevice")
        : t("cloud.devices", { count: status.devices }),
  });
}

/**
 * The red line for what stopped saving or reading ("Reconnect needed", storage full,
 * update needed); none while it works. A retry is not shown: it goes on by itself.
 */
export function cloudErrorLine(
  status: Pick<CloudStatus, "error">,
  name: string,
): string | undefined {
  switch (status.error) {
    case "reconnect":
      return t("cloud.error.reconnect");
    case "full":
      return t("cloud.error.full", { provider: name });
    case "update":
      return t("cloud.error.update");
    default:
      return undefined;
  }
}
