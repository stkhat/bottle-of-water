import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  createPackDownloads,
  PACKS_RETRY_ALARM,
  PACKS_RETRY_FAILURES_KEY,
  retryDelayMinutes,
  startPackDownloads,
  type PackDownloads,
} from "./pack-downloads";
import type { EnsureResult, PackStore } from "./pack-store";
import { getSettings, setSettings } from "./settings-store";

beforeEach(() => fakeBrowser.reset());
afterEach(() => vi.restoreAllMocks());

const READY: EnsureResult = { ready: ["en", "en-ja", "en-defs"], failed: [] };
const FAILED: EnsureResult = { ready: ["es"], failed: ["es-en"] };

let ensure: Mock<PackStore["ensure"]>;
let markFailed: Mock<PackStore["markFailed"]>;
let downloads: PackDownloads;

beforeEach(() => {
  ensure = vi.fn(async () => READY);
  markFailed = vi.fn(async () => {});
  downloads = createPackDownloads({
    store: { ensure, markFailed },
    getSettings,
  });
});

/** Downloads whose runs a test counts (nothing is downloaded). */
const fakeDownloads = (ensurePair: PackDownloads["ensurePair"]) => {
  const retryPending = vi.fn(async () => {});
  return { ensurePair: vi.fn(ensurePair), retryPending };
};

const failures = async () =>
  (await browser.storage.local.get(PACKS_RETRY_FAILURES_KEY))[
    PACKS_RETRY_FAILURES_KEY
  ];

describe("retryDelayMinutes", () => {
  it("waits 1, 5 and 30 minutes after the first failures, then 6 hours", () => {
    expect([1, 2, 3, 4, 5, 20].map(retryDelayMinutes)).toEqual([
      1, 5, 30, 360, 360, 360,
    ]);
  });
});

describe("pack downloads", () => {
  it("brings the chosen pair's packs to their lock version", async () => {
    expect(await downloads.ensurePair()).toEqual(READY);
    expect(ensure).toHaveBeenLastCalledWith(["en", "en-ja", "en-defs"]);
    await setSettings({ learningLang: "es", nativeLang: "en" });
    await downloads.ensurePair();
    expect(ensure).toHaveBeenLastCalledWith(["es", "es-en"]);
  });

  it("schedules a retry after each failure, waiting longer each time", async () => {
    ensure.mockResolvedValue(FAILED);
    const create = vi.spyOn(browser.alarms, "create");
    for (let i = 0; i < 5; i++) await downloads.ensurePair();
    expect(create.mock.calls).toEqual(
      [1, 5, 30, 360, 360].map((delayInMinutes) => [
        PACKS_RETRY_ALARM,
        { delayInMinutes },
      ]),
    );
    expect(await failures()).toBe(5);
    expect(await browser.alarms.get(PACKS_RETRY_ALARM)).toBeDefined();
  });

  it("clears the retry and the count of failures once the packs are there", async () => {
    ensure.mockResolvedValueOnce(FAILED).mockResolvedValueOnce(FAILED);
    await downloads.ensurePair();
    await downloads.ensurePair();
    expect(await failures()).toBe(2);
    await downloads.ensurePair();
    expect(await failures()).toBeUndefined();
    expect(await browser.alarms.get(PACKS_RETRY_ALARM)).toBeUndefined();
    ensure.mockResolvedValueOnce(FAILED);
    const create = vi.spyOn(browser.alarms, "create");
    await downloads.ensurePair();
    expect(create).toHaveBeenCalledWith(PACKS_RETRY_ALARM, {
      delayInMinutes: 1,
    });
  });

  it("writes nothing when nothing failed or was scheduled", async () => {
    const set = vi.spyOn(browser.storage.local, "set");
    const remove = vi.spyOn(browser.storage.local, "remove");
    const clear = vi.spyOn(browser.alarms, "clear");
    await downloads.ensurePair();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("marks the chosen pair's packs failed while a retry waits", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    await downloads.retryPending();
    expect(markFailed).toHaveBeenCalledWith(["es", "es-en"], "Retry pending");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("shares one run between overlapping calls for the same pair", async () => {
    let finish!: (result: EnsureResult) => void;
    ensure.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const create = vi.spyOn(browser.alarms, "create");
    const a = downloads.ensurePair();
    const b = downloads.ensurePair();
    await vi.waitFor(() => expect(ensure).toHaveBeenCalledTimes(1));
    finish(FAILED);
    expect(await a).toEqual(FAILED);
    expect(await b).toEqual(FAILED);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await failures()).toBe(1);
  });
});

describe("startPackDownloads", () => {
  /** Starts with a Japanese browser UI. */
  const start = (d: PackDownloads) => startPackDownloads(d, () => "ja");

  // Settings are stored: every start but that of a new install ("on a new install").
  beforeEach(async () => {
    await setSettings({});
  });

  const alarm = (name: string) => ({
    name,
    scheduledTime: Date.now(),
    persistAcrossSessions: false,
  });

  it("ensures the pair's packs at start, then on install, on the retry alarm, on retryPacks and when the pair changes", async () => {
    const fake = fakeDownloads(async () => READY);
    const { ensurePair } = fake;
    const { retry, started } = start(fake);
    await started;
    expect(ensurePair).toHaveBeenCalledTimes(1);
    expect(fake.retryPending).not.toHaveBeenCalled();

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: "update",
      previousVersion: "0.0.9",
    });
    await vi.waitFor(() => expect(ensurePair).toHaveBeenCalledTimes(2));

    await fakeBrowser.alarms.onAlarm.trigger(alarm(PACKS_RETRY_ALARM));
    expect(ensurePair).toHaveBeenCalledTimes(3);
    await fakeBrowser.alarms.onAlarm.trigger(alarm("something-else"));
    expect(ensurePair).toHaveBeenCalledTimes(3);

    await setSettings({ knownLevel: 5000 });
    await setSettings({ nativeLang: "en", learningLang: "es" });
    await vi.waitFor(() => expect(ensurePair).toHaveBeenCalledTimes(4));
    await setSettings({ knownLevel: 6000 });
    await setSettings({ learningLang: "es" });
    await setSettings({ learningLang: "en", nativeLang: "ja" });
    await vi.waitFor(() => expect(ensurePair).toHaveBeenCalledTimes(5));

    retry();
    expect(ensurePair).toHaveBeenCalledTimes(6);
  });

  /** A retry scheduled after `count` failures in a row, as a stopped worker left it. */
  async function retryScheduled(count: number) {
    await browser.storage.local.set({ [PACKS_RETRY_FAILURES_KEY]: count });
    await browser.alarms.create(PACKS_RETRY_ALARM, { delayInMinutes: 5 });
  }

  it("leaves a start to the retry alarm when one is scheduled after failures", async () => {
    await retryScheduled(2);
    const fake = fakeDownloads(async () => FAILED);
    const { ensurePair } = fake;
    const { retry, started } = start(fake);
    await started;
    expect(ensurePair).not.toHaveBeenCalled();
    // What a stopped download left as "downloading" shows as failed until then.
    expect(fake.retryPending).toHaveBeenCalledTimes(1);

    await fakeBrowser.alarms.onAlarm.trigger(alarm(PACKS_RETRY_ALARM));
    expect(ensurePair).toHaveBeenCalledTimes(1);
    retry();
    expect(ensurePair).toHaveBeenCalledTimes(2);
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: "update",
      previousVersion: "0.0.9",
    });
    await vi.waitFor(() => expect(ensurePair).toHaveBeenCalledTimes(3));
  });

  it("still ensures a new pair at once while a retry is scheduled", async () => {
    await retryScheduled(1);
    const fake = fakeDownloads(async () => READY);
    const { ensurePair } = fake;
    await start(fake).started;
    expect(ensurePair).not.toHaveBeenCalled();
    await setSettings({ learningLang: "es", nativeLang: "en" });
    await vi.waitFor(() => expect(ensurePair).toHaveBeenCalledTimes(1));
  });

  it("ensures at start when the alarm or the failures are missing", async () => {
    const fake = fakeDownloads(async () => READY);
    const { ensurePair } = fake;
    await browser.alarms.create(PACKS_RETRY_ALARM, { delayInMinutes: 5 });
    await start(fake).started;
    expect(ensurePair).toHaveBeenCalledTimes(1);

    fakeBrowser.reset();
    await setSettings({});
    await browser.storage.local.set({ [PACKS_RETRY_FAILURES_KEY]: 3 });
    await start(fake).started;
    expect(ensurePair).toHaveBeenCalledTimes(2);

    fakeBrowser.reset();
    await setSettings({});
    await retryScheduled(0);
    await start(fake).started;
    expect(ensurePair).toHaveBeenCalledTimes(3);
    expect(fake.retryPending).not.toHaveBeenCalled();
  });

  it("logs a run that could not start instead of leaving it unhandled", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    start(fakeDownloads(() => Promise.reject(new Error("storage is gone"))));
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  });

  describe("on a new install", () => {
    beforeEach(async () => {
      await browser.storage.sync.clear();
    });

    const install = () =>
      fakeBrowser.runtime.onInstalled.trigger({ reason: "install" });

    it("downloads nothing at start, then stores the UI language's pair and downloads only its packs", async () => {
      const { started } = startPackDownloads(downloads, () => "es-419");
      await started;
      expect(ensure).not.toHaveBeenCalled();

      await install();
      await vi.waitFor(() =>
        expect(ensure).toHaveBeenCalledWith(["en", "en-es", "en-defs"]),
      );
      const { learningLang, nativeLang } = await getSettings();
      expect([learningLang, nativeLang]).toEqual(["en", "es"]);
      expect(ensure.mock.calls.flat(2)).not.toContain("en-ja");
    });

    it("downloads English → Japanese for a Japanese UI, Spanish → English for an English one", async () => {
      startPackDownloads(downloads, () => "ja");
      await install();
      await vi.waitFor(() =>
        expect(ensure).toHaveBeenCalledWith(["en", "en-ja", "en-defs"]),
      );

      fakeBrowser.reset();
      ensure.mockClear();
      startPackDownloads(downloads, () => "en-US");
      await install();
      await vi.waitFor(() =>
        expect(ensure).toHaveBeenCalledWith(["es", "es-en"]),
      );
      expect(ensure.mock.calls.flat(2)).not.toContain("en-ja");
    });

    it("keeps settings browser sync brought from another device", async () => {
      await browser.storage.sync.set({
        settings: { learningLang: "en", nativeLang: "pt" },
      });
      startPackDownloads(downloads, () => "ja");
      await install();
      await vi.waitFor(() =>
        expect(ensure).toHaveBeenCalledWith(["en", "en-pt", "en-defs"]),
      );
      expect(ensure.mock.calls.flat(2)).not.toContain("en-ja");
    });

    it("downloads the pair even when it cannot be stored", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(browser.storage.sync, "set").mockRejectedValue(
        new Error("quota"),
      );
      startPackDownloads(downloads, () => "es");
      await install();
      await vi.waitFor(() =>
        expect(ensure).toHaveBeenCalledWith(["en", "en-ja", "en-defs"]),
      );
      expect(error).toHaveBeenCalledTimes(1);
    });
  });
});
