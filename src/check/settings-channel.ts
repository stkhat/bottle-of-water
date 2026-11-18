/**
 * Check builds only (`wxt build --mode check`, `npm run build:check`): a web page reads
 * and changes Langle's settings through the content script, so a check in your own
 * Chrome can switch the language pair (or any other setting) without opening the
 * Settings page, which Claude in Chrome cannot open. A change goes the way Settings
 * sends it (`setSettings` to the background, one `storage.sync` write), so packs
 * download and pages analyze again as after a choice in Settings. Production builds
 * leave all of this out (`npm run test:manifest` checks it).
 */
import { nativeLanguages } from "../core/languages";
import { packsFor } from "../core/packs/pairs";
import { packUsable, type PackStates } from "../core/packs/state";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../core/settings";

/** The `type` of every message of this channel on the page. */
export const SETTINGS_MESSAGE_TYPE = "langle:check-settings";

type Action = "get" | "set" | "packs";

/** A web page's request (docs/development.md "Checking in your own Chrome"). */
interface SettingsPageRequest {
  type: typeof SETTINGS_MESSAGE_TYPE;
  action: Action;
  id: string;
  /** `set` only: a partial settings object, merged into the stored one. */
  settings?: unknown;
}

/** What the chosen pair's packs are doing (the `packs` action). */
export interface PackReport {
  /** `packState` from `storage.local`: every pack the background has handled since it started. */
  packState: PackStates;
  /** The chosen pair's packs. */
  packs: string[];
  /** Every one of `packs` can be used. */
  ready: boolean;
  /** One of `packs` failed (retried later). */
  failed: boolean;
}

/** A content script's answer to a page. */
export type SettingsPageReply = {
  type: typeof SETTINGS_MESSAGE_TYPE;
  id: string;
  reply: true;
} & (
  | { ok: true; settings: Settings }
  | ({ ok: true } & PackReport)
  | { ok: false; error: string }
);

const ACTIONS: readonly Action[] = ["get", "set", "packs"];

const isPageRequest = (data: unknown): data is SettingsPageRequest => {
  const d = data as Partial<SettingsPageRequest & { reply: unknown }> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    d.type === SETTINGS_MESSAGE_TYPE &&
    d.reply === undefined &&
    ACTIONS.includes(d.action as Action) &&
    typeof d.id === "string"
  );
};

const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The paths of `value`'s leaves: nested groups key by key, arrays whole. */
function leaves(
  value: Record<string, unknown>,
  prefix: string[] = [],
): string[][] {
  return Object.entries(value).flatMap(([key, item]) =>
    isDict(item) ? leaves(item, [...prefix, key]) : [[...prefix, key]],
  );
}

const at = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      isDict(node) && Object.hasOwn(node, key) ? node[key] : undefined,
    value,
  );

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/**
 * The patch to send for a page's `set`, or why it is refused. Every value must be one
 * the settings normalizer (`mergeSettings`) keeps as given: an unknown key, an
 * ill-typed value or a slider value off its range or step is refused, not dropped or
 * clamped. A new learning language without a native language comes with its first
 * native language, as in Settings. The resulting pair must be one Langle offers.
 */
export function planSettingsChange(
  input: unknown,
  current: Settings,
): { ok: true; patch: SettingsPatch } | { ok: false; error: string } {
  if (!isDict(input))
    return { ok: false, error: "settings must be an object of settings" };
  const patch: Record<string, unknown> = { ...input };
  if (
    typeof patch.learningLang === "string" &&
    patch.learningLang !== current.learningLang &&
    !Object.hasOwn(patch, "nativeLang")
  ) {
    const native = nativeLanguages(patch.learningLang)[0];
    if (native !== undefined) patch.nativeLang = native;
  }
  const next = mergeSettings(patch, current);
  const refused = leaves(patch).flatMap((path) => {
    const name = path.join(".");
    if (at(DEFAULT_SETTINGS, path) === undefined)
      return [`${name} is not a setting`];
    const given = at(patch, path);
    const kept = at(next, path);
    return show(given) === show(kept)
      ? []
      : [`${name}: ${show(given)} is not accepted (it would be ${show(kept)})`];
  });
  if (refused.length > 0) return { ok: false, error: refused.join("; ") };
  const offered = nativeLanguages(next.learningLang);
  if (!offered.includes(next.nativeLang))
    return {
      ok: false,
      error:
        offered.length === 0
          ? `${next.learningLang} is not an offered learning language`
          : `${next.learningLang} → ${next.nativeLang} is not an offered pair (native languages for ${next.learningLang}: ${offered.join(", ")})`,
    };
  return { ok: true, patch: patch as SettingsPatch };
}

/** The `packs` action's answer for the chosen pair. */
export function packReport(
  packState: PackStates,
  settings: Pick<Settings, "learningLang" | "nativeLang">,
): PackReport {
  const packs = packsFor(settings.learningLang, settings.nativeLang);
  return {
    packState,
    packs,
    ready: packs.every((pack) => packUsable(packState[pack])),
    failed: packs.some((pack) => packState[pack]?.state === "failed"),
  };
}

export interface SettingsChannelDeps {
  /** The background's `getSettings`. */
  getSettings(): Promise<Settings>;
  /** The background's `setSettings` (what Settings sends): the stored result. */
  setSettings(patch: SettingsPatch): Promise<Settings>;
  /** `packState` from `storage.local`. */
  packStates(): Promise<PackStates>;
  /** After a change of the pair: what Settings starts on a choice too (best effort). */
  pairChosen?(learning: string, native: string): void;
}

/**
 * Answers a page's `window.postMessage` requests to get or set the settings, or to read
 * the packs' state. Requests from other windows (frames, the parent) are ignored; the
 * caller starts it in the top frame only (start.ts). Returns a stop.
 */
export function answerSettingsRequests(
  options: {
    window: Pick<
      Window,
      "addEventListener" | "removeEventListener" | "postMessage"
    >;
  } & SettingsChannelDeps,
): () => void {
  const { window: win } = options;

  async function answer(
    request: SettingsPageRequest,
  ): Promise<{ ok: true; settings: Settings } | ({ ok: true } & PackReport)> {
    if (request.action === "get")
      return { ok: true, settings: await options.getSettings() };
    if (request.action === "packs") {
      const [states, settings] = await Promise.all([
        options.packStates(),
        options.getSettings(),
      ]);
      return { ok: true, ...packReport(states, settings) };
    }
    const current = await options.getSettings();
    const plan = planSettingsChange(request.settings, current);
    if (!plan.ok) throw new Error(plan.error);
    const settings = await options.setSettings(plan.patch);
    if (
      settings.learningLang !== current.learningLang ||
      settings.nativeLang !== current.nativeLang
    )
      options.pairChosen?.(settings.learningLang, settings.nativeLang);
    return { ok: true, settings };
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== win || !isPageRequest(event.data)) return;
    const request = event.data;
    void answer(request)
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((result) => {
        const reply = {
          type: SETTINGS_MESSAGE_TYPE,
          id: request.id,
          reply: true,
          ...result,
        } as SettingsPageReply;
        win.postMessage(reply, "*");
      });
  };
  win.addEventListener("message", onMessage as (event: Event) => void);
  return () =>
    win.removeEventListener("message", onMessage as (event: Event) => void);
}
