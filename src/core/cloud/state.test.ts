import { describe, expect, it } from "vitest";
import {
  changeSettings,
  choose,
  clearHistory,
  encounter,
  forgetHost,
  makeDevice,
  read,
  recordHistory,
  removeTerm,
  saveTerm,
  write,
  type Cloud,
} from "../../testing/cloud-devices";
import { pageSize, sentenceSize } from "../history-size";
import { filePath } from "./format";
import { applyLimits } from "./state";

const NOV = Date.UTC(2026, 10, 2);
const DAY = 86_400_000;
const at = (url: string, sentence: string) => ({ url, title: "", sentence });
const A = "https://a.example/1";
const B = "https://b.example/2";

function pair() {
  let clock = NOV;
  const cloud: Cloud = new Map();
  return {
    cloud,
    one: makeDevice("one", () => clock),
    two: makeDevice("two", () => clock),
    later: (ms = 1000) => (clock += ms),
  };
}

const sentences = (state: { occurrences: Map<string, { sentence: string }> }) =>
  [...state.occurrences.values()].map((o) => o.sentence).sort();

describe("reading files", () => {
  it("reads a month file again when its rows wait for a term not known yet", async () => {
    const { cloud, one, two } = pair();
    saveTerm(one, "bank", "learning", at(A, "By the bank."));
    await write(one, cloud);
    await read(two, cloud, {
      paths: [filePath("one", "occurrences", "2026-11")],
    });
    expect(two.state.occurrences.size).toBe(0);
    expect(two.pending.size).toBe(1);
    await read(two, cloud, { paths: [filePath("one", "main")] });
    expect(sentences(two.state)).toEqual(["By the bank."]);
    expect(two.pending.size).toBe(0);
  });

  it("replaces an older copy of a row its writer dropped and recorded again in the same month", async () => {
    const { cloud, one, two, later } = pair();
    recordHistory(one, { url: A, title: "" }, "One.");
    await write(one, cloud);
    await read(two, cloud);
    const first = [...two.state.sentences.values()][0]!;

    // Room for one page: each new page pushes the other out.
    const [page] = [...one.state.pages.values()];
    one.limits = {
      historyCapBytes: 1.5 * (pageSize(page!) + sentenceSize(first)),
    };
    later(DAY);
    recordHistory(one, { url: B, title: "" }, "One.");
    later(DAY);
    recordHistory(one, { url: A, title: "" }, "One.");
    await write(one, cloud);
    await read(two, cloud);
    const again = [...two.state.sentences.values()];
    expect(again).toHaveLength(1);
    expect(again[0]!.addedAt).toBeGreaterThan(first.addedAt);
  });

  it("drops the rows a writer no longer lists (here: trimmed)", async () => {
    const { cloud, one, two, later } = pair();
    saveTerm(one, "bank", "learning", at(A, "By the bank."));
    later();
    encounter(one, "bank", at(B, "A bank."));
    await write(one, cloud);
    await read(two, cloud);
    expect(sentences(two.state)).toEqual(["A bank.", "By the bank."]);

    one.limits = { maxOccurrences: 1 };
    applyLimits(one.state, one.limits);
    await write(one, cloud);
    await read(two, cloud);
    expect(sentences(two.state)).toEqual(["By the bank."]);
  });

  it("writes a month that has nothing left as an empty file, so others drop its rows", async () => {
    const { cloud, one, two, later } = pair();
    recordHistory(one, { url: A, title: "" }, "One.");
    later(30 * DAY);
    recordHistory(one, { url: B, title: "" }, "One.");
    await write(one, cloud);
    await read(two, cloud);
    expect(two.state.pages.size).toBe(2);

    const [page] = [...one.state.pages.values()];
    const [sentence] = [...one.state.sentences.values()];
    one.limits = {
      historyCapBytes: 1.5 * (pageSize(page!) + sentenceSize(sentence!)),
    };
    applyLimits(one.state, one.limits);
    await write(one, cloud);
    expect(cloud.has(filePath("one", "history", "2026-11"))).toBe(true);
    await read(two, cloud);
    expect(one.state.sentences.size).toBe(1);
    expect([...two.state.sentences.values()]).toEqual([
      ...one.state.sentences.values(),
    ]);
  });
});

describe("removals", () => {
  it("drops a removed term's rows and choices everywhere; saving it again does not bring them back", async () => {
    const { cloud, one, two, later } = pair();
    await choose(one, "bank", at(A, "By the bank."), "土手");
    await write(one, cloud);
    await read(two, cloud);
    expect(two.state.choices.size).toBe(1);
    expect(two.state.meanings.size).toBe(1);

    later();
    removeTerm(two, "bank");
    await write(two, cloud);
    later();
    saveTerm(one, "bank", "known", at(B, "A bank."));
    await read(one, cloud);
    expect(sentences(one.state)).toEqual(["A bank."]);
    expect(one.state.choices.size).toBe(0);
    expect(one.state.meanings.size).toBe(0);
    expect(one.state.terms.get("en:bank")!.status).toBe("known");
  });

  it("keeps rows recorded after a removal by a device that had not heard of it", async () => {
    const { cloud, one, two, later } = pair();
    saveTerm(one, "bank", "learning", at(A, "By the bank."));
    await write(one, cloud);
    await read(two, cloud);
    later();
    removeTerm(one, "bank");
    later();
    encounter(two, "bank", at(B, "A bank."));
    await write(one, cloud);
    await write(two, cloud);
    await read(one, cloud);
    await read(two, cloud);
    for (const d of [one, two]) {
      expect(d.state.terms.get("en:bank")!.status).toBe("removed");
      expect(sentences(d.state)).toEqual(["A bank."]);
    }
  });
});

describe("history", () => {
  it("drops other devices' history from before a Clear, and a host's from before Never run on", async () => {
    const { cloud, one, two, later } = pair();
    recordHistory(two, { url: A, title: "" }, "One.");
    recordHistory(two, { url: B, title: "" }, "Two.");
    await write(two, cloud);
    later();
    forgetHost(one, "a.example");
    await write(one, cloud);
    await read(two, cloud);
    expect([...two.state.pages.values()].map((p) => p.host)).toEqual([
      "b.example",
    ]);
    later();
    clearHistory(one);
    await write(one, cloud);
    await read(two, cloud);
    expect(two.state.pages.size).toBe(0);
    expect(two.state.sentences.size).toBe(0);
  });

  it("drops the pages seen longest ago once over the cap, the same on every device", async () => {
    const { cloud, one, two, later } = pair();
    for (const url of [A, B, "https://c.example/3"]) {
      recordHistory(one, { url, title: "" }, "A sentence of some length.");
      later();
    }
    await write(one, cloud);
    two.limits = { historyCapBytes: 600 };
    await read(two, cloud);
    const kept = [...two.state.pages.values()].map((p) => p.host).sort();
    expect(kept.length).toBeLessThan(3);
    expect(kept).toContain("c.example");
  });
});

describe("settings", () => {
  it("takes each field from the device that changed it later", async () => {
    const { cloud, one, two, later } = pair();
    changeSettings(one, { knownLevel: 5000 });
    later();
    changeSettings(two, { theme: "dark" });
    await write(one, cloud);
    await write(two, cloud);
    await read(one, cloud);
    await read(two, cloud);
    for (const d of [one, two]) {
      expect(d.state.settings.values.knownLevel).toBe(5000);
      expect(d.state.settings.values.theme).toBe("dark");
    }
  });
});
