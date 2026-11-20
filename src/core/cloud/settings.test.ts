import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../settings";
import {
  mergeTimedSettings,
  SETTINGS_FIELDS,
  stampSettings,
  type TimedSettings,
} from "./settings";

const fresh = (): TimedSettings => ({
  values: mergeSettings(DEFAULT_SETTINGS),
  times: {},
});

const changed = (patch: Partial<Settings>): Settings => ({
  ...mergeSettings(DEFAULT_SETTINGS),
  ...patch,
});

describe("SETTINGS_FIELDS", () => {
  it("names top-level settings and each switch of a group; a list is one field", () => {
    expect(SETTINGS_FIELDS).toContain("knownLevel");
    expect(SETTINGS_FIELDS).toContain("sites.youtube");
    expect(SETTINGS_FIELDS).toContain("highlight.known");
    expect(SETTINGS_FIELDS).toContain("neverRunOn");
    expect(SETTINGS_FIELDS).not.toContain("sites");
  });
});

describe("stampSettings", () => {
  it("times the fields that differ from the defaults when there are no times yet (an older Langle)", () => {
    const stamped = stampSettings(
      changed({ knownLevel: 5000, theme: "dark" }),
      100,
    );
    expect(stamped.times).toEqual({ knownLevel: 100, theme: 100 });
    expect(stamped.values.knownLevel).toBe(5000);
  });

  it("gives a changed field the new time and keeps the others' times", () => {
    const before = stampSettings(changed({ knownLevel: 5000 }), 100);
    const after = stampSettings(
      changed({
        knownLevel: 5000,
        sites: { ...DEFAULT_SETTINGS.sites, netflix: false },
      }),
      200,
      before,
    );
    expect(after.times).toEqual({ knownLevel: 100, "sites.netflix": 200 });
  });

  it("times a change after the time of the value it replaces, so it wins everywhere", () => {
    const ahead = { values: changed({ theme: "dark" }), times: { theme: 500 } };
    expect(
      stampSettings(changed({ theme: "light" }), 200, ahead).times,
    ).toEqual({ theme: 501 });
  });
});

describe("mergeTimedSettings", () => {
  it("takes each field from the side that changed it later", () => {
    const local: TimedSettings = {
      values: changed({ knownLevel: 5000, theme: "dark" }),
      times: { knownLevel: 300, theme: 100 },
    };
    const incoming: TimedSettings = {
      values: changed({ knownLevel: 8000, theme: "light" }),
      times: { knownLevel: 200, theme: 400 },
    };
    const merged = mergeTimedSettings(local, incoming);
    expect(merged.values.knownLevel).toBe(5000);
    expect(merged.values.theme).toBe("light");
    expect(merged.times).toEqual({ knownLevel: 300, theme: 400 });
  });

  it("counts defaults as time 0: a fresh install overwrites nothing", () => {
    const local = stampSettings(changed({ knownLevel: 5000 }), 100);
    expect(mergeTimedSettings(local, fresh())).toEqual(local);
  });

  it("takes one changed field from the mobile app without the rest", () => {
    const local = stampSettings(changed({ knownLevel: 5000 }), 100);
    const mobile = stampSettings(changed({ theme: "dark" }), 200);
    const merged = mergeTimedSettings(local, mobile);
    expect(merged.values.knownLevel).toBe(5000);
    expect(merged.values.theme).toBe("dark");
  });

  it("merges switches of one group field by field", () => {
    const local = stampSettings(
      changed({ sites: { ...DEFAULT_SETTINGS.sites, youtube: false } }),
      100,
    );
    const incoming = stampSettings(
      changed({ sites: { ...DEFAULT_SETTINGS.sites, netflix: false } }),
      200,
    );
    expect(mergeTimedSettings(local, incoming).values.sites).toEqual({
      ...DEFAULT_SETTINGS.sites,
      youtube: false,
      netflix: false,
    });
  });

  it("breaks a tie by the smaller JSON, on either side", () => {
    const a = { values: changed({ theme: "light" }), times: { theme: 100 } };
    const b = { values: changed({ theme: "dark" }), times: { theme: 100 } };
    expect(mergeTimedSettings(a, b).values.theme).toBe("dark");
    expect(mergeTimedSettings(b, a).values.theme).toBe("dark");
  });

  it("keeps the local value for a value this version cannot read", () => {
    const local = stampSettings(changed({ theme: "dark" }), 100);
    const incoming = {
      values: { ...changed({}), theme: "sepia" },
      times: { theme: 200, knownLevel: Number.NaN },
    };
    const merged = mergeTimedSettings(local, incoming);
    expect(merged.values.theme).toBe("dark");
    expect(merged.times.knownLevel).toBeUndefined();
  });

  it("is commutative and idempotent", () => {
    const a = stampSettings(changed({ knownLevel: 5000, theme: "dark" }), 100);
    const b = stampSettings(
      changed({ knownLevel: 8000, neverRunOn: ["example.com"] }),
      150,
    );
    expect(mergeTimedSettings(a, b)).toEqual(mergeTimedSettings(b, a));
    const ab = mergeTimedSettings(a, b);
    expect(mergeTimedSettings(ab, b)).toEqual(ab);
  });
});
