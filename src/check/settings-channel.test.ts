import { describe, expect, it } from "vitest";
import { nativeLanguages } from "../core/languages";
import { packsFor } from "../core/packs/pairs";
import { DEFAULT_SETTINGS, mergeSettings } from "../core/settings";
import { packReport, planSettingsChange } from "./settings-channel";

const current = mergeSettings({});

describe("planSettingsChange", () => {
  it("passes an offered pair and any other settings the normalizer keeps as given", () => {
    const patch = {
      learningLang: "en",
      nativeLang: "fr",
      highlight: { new: true },
      knownLevel: 5000,
      neverRunOn: ["example.com"],
      theme: "dark",
    };
    expect(planSettingsChange(patch, current)).toEqual({ ok: true, patch });
  });

  it("takes back a whole earlier get (restoring the user's settings)", () => {
    const saved = mergeSettings({ learningLang: "es", nativeLang: "en" });
    expect(planSettingsChange(saved, current)).toEqual({
      ok: true,
      patch: saved,
    });
  });

  it("gives a new learning language its first native language, as Settings does", () => {
    const plan = planSettingsChange({ learningLang: "es" }, current);
    expect(plan).toEqual({
      ok: true,
      patch: { learningLang: "es", nativeLang: nativeLanguages("es")[0] },
    });
  });

  it("refuses a pair Langle does not offer, naming the offered native languages", () => {
    const plan = planSettingsChange({ nativeLang: "xx" }, current);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error).toContain("en → xx is not an offered pair");
    expect(!plan.ok && plan.error).toContain(nativeLanguages("en").join(", "));
  });

  it("refuses a learning language Langle does not offer", () => {
    const plan = planSettingsChange(
      { learningLang: "xx", nativeLang: "ja" },
      current,
    );
    expect(plan).toEqual({
      ok: false,
      error: "xx is not an offered learning language",
    });
  });

  it("refuses unknown keys and values the normalizer would drop or clamp", () => {
    const plan = planSettingsChange(
      {
        colour: "red",
        highlight: { new: "yes", maybe: true },
        knownLevel: 3250,
        theme: "blue",
      },
      current,
    );
    expect(plan.ok).toBe(false);
    const error = plan.ok ? "" : plan.error;
    for (const part of [
      "colour is not a setting",
      'highlight.new: "yes" is not accepted',
      "highlight.maybe is not a setting",
      "knownLevel: 3250 is not accepted (it would be ",
      'theme: "blue" is not accepted (it would be "system")',
    ])
      expect(error).toContain(part);
  });

  it("refuses what is not an object", () => {
    expect(planSettingsChange("en-fr", current).ok).toBe(false);
    expect(planSettingsChange(undefined, current).ok).toBe(false);
  });
});

describe("packReport", () => {
  const pair = { learningLang: "en", nativeLang: "fr" };
  const packs = packsFor("en", "fr");
  const state = (s: "ready" | "downloading" | "failed") => ({
    state: s,
    received: 1,
    total: 2,
  });

  it("is ready once every pack of the chosen pair can be used", () => {
    const ready = Object.fromEntries(packs.map((p) => [p, state("ready")]));
    expect(packReport(ready, pair)).toEqual({
      packState: ready,
      packs,
      ready: true,
      failed: false,
    });
  });

  it("is not ready while a pack downloads or has no state yet, and says when one failed", () => {
    expect(packReport({}, pair)).toMatchObject({ ready: false, failed: false });
    const [first, ...rest] = packs;
    const states = {
      [first!]: state("failed"),
      ...Object.fromEntries(rest.map((p) => [p, state("ready")])),
    };
    expect(packReport(states, pair)).toMatchObject({
      ready: false,
      failed: true,
    });
  });

  it("counts an update in progress as usable", () => {
    const updating = Object.fromEntries(
      packs.map((p) => [
        p,
        { ...state("downloading"), updating: true as const },
      ]),
    );
    expect(packReport(updating, pair).ready).toBe(true);
  });

  it("names the packs of the pair in the settings", () => {
    const { learningLang, nativeLang } = DEFAULT_SETTINGS;
    expect(packReport({}, DEFAULT_SETTINGS).packs).toEqual(
      packsFor(learningLang, nativeLang),
    );
  });
});
