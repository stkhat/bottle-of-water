/**
 * Settings with a time per field, so devices merge them field by field: the newer field
 * time wins, and defaults count as time 0, so a fresh install or the mobile app changing
 * one field does not overwrite the rest.
 */
import { compareKeys } from "../sync/codec";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../settings";

/**
 * A field is a top-level setting, or one key of a group of switches (`sites.youtube`);
 * a list (`neverRunOn`) is one field.
 */
export interface TimedSettings {
  values: Settings;
  /** Field → when it last changed. A field left out has time 0 (never changed). */
  times: Record<string, number>;
}

/** Settings as a file carries them: values not checked yet. */
export interface FileSettings {
  values: unknown;
  times: Record<string, number>;
}

const isGroup = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every field, in the order of `DEFAULT_SETTINGS`. */
export const SETTINGS_FIELDS: readonly string[] = Object.entries(
  DEFAULT_SETTINGS,
).flatMap(([key, value]) =>
  isGroup(value) ? Object.keys(value).map((sub) => `${key}.${sub}`) : [key],
);

function fieldOf(settings: Settings, field: string): unknown {
  const [key, sub] = field.split(".") as [keyof Settings, string?];
  const value: unknown = settings[key];
  return sub === undefined ? value : (value as Record<string, unknown>)[sub];
}

function setField(settings: Settings, field: string, value: unknown) {
  const [key, sub] = field.split(".") as [keyof Settings, string?];
  const target = settings as unknown as Record<string, unknown>;
  if (sub === undefined) target[key] = value;
  else target[key] = { ...(target[key] as object), [sub]: value };
}

const json = (value: unknown) => JSON.stringify(value);

/**
 * `values` with times: a field that differs from `previous` changed at `at`; the rest
 * keep their times. Without `previous` the defaults are the previous values, at time 0,
 * so settings from before field times (an older Langle) count their non-default fields
 * as changed at `at`.
 */
export function stampSettings(
  values: Settings,
  at: number,
  previous: TimedSettings = { values: DEFAULT_SETTINGS, times: {} },
): TimedSettings {
  const times: Record<string, number> = {};
  for (const field of SETTINGS_FIELDS) {
    const before = previous.times[field] ?? 0;
    const changed =
      json(fieldOf(values, field)) !== json(fieldOf(previous.values, field));
    const time = changed ? Math.max(at, before + 1) : before;
    if (time > 0) times[field] = time;
  }
  return { values: mergeSettings(values), times };
}

const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Per field, the newer time wins; at the same time, the value whose JSON is smaller
 * (by code point), so every device picks the same. The incoming values are checked as
 * `mergeSettings` does: a value this version cannot read keeps the local one.
 */
export function mergeTimedSettings(
  local: TimedSettings,
  incoming: FileSettings,
): TimedSettings {
  const theirs = mergeSettings(incoming.values, local.values);
  const values = mergeSettings(local.values);
  const times: Record<string, number> = {};
  for (const field of SETTINGS_FIELDS) {
    const ours = local.times[field] ?? 0;
    const raw = incoming.times[field];
    const time = isTime(raw) ? raw : 0;
    const mine = json(fieldOf(values, field));
    const other = json(fieldOf(theirs, field));
    if (time > ours || (time === ours && compareKeys(other, mine) < 0))
      setField(values, field, fieldOf(theirs, field));
    const latest = Math.max(ours, time);
    if (latest > 0) times[field] = latest;
  }
  return { values, times };
}
