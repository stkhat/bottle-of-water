import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../core/settings";
import {
  articlesAllowedOn,
  shouldRunArticle,
  type DetectLanguage,
} from "./should-run";

const settings = (patch: object = {}) => mergeSettings(patch, DEFAULT_SETTINGS);
const LONG_EN = "Most home bakers rush the process. ".repeat(10);

const detected =
  (language: string, isReliable = true): DetectLanguage =>
  async () => ({ isReliable, languages: [{ language, percentage: 97 }] });

describe("articlesAllowedOn", () => {
  it("allows an ordinary host by default", () => {
    expect(articlesAllowedOn("example.com", settings())).toBe(true);
  });

  it.each([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "netflix.com",
    "www.netflix.com",
  ])("leaves the video site %s to the video UI", (host) => {
    expect(articlesAllowedOn(host, settings())).toBe(false);
  });

  it("does not treat look-alike hosts as video sites", () => {
    expect(articlesAllowedOn("notyoutube.com", settings())).toBe(true);
  });

  it("stays off when articles are switched off", () => {
    expect(
      articlesAllowedOn(
        "example.com",
        settings({ sites: { articles: false } }),
      ),
    ).toBe(false);
  });

  it.each(["neverRunOn", "disabledSites"])(
    "stays off on hosts in %s, including their subdomains",
    (list) => {
      const s = settings({ [list]: ["Example.com"] });
      expect(articlesAllowedOn("example.com", s)).toBe(false);
      expect(articlesAllowedOn("www.example.com", s)).toBe(false);
      expect(articlesAllowedOn("example.org", s)).toBe(true);
      expect(articlesAllowedOn("myexample.com", s)).toBe(true);
    },
  );
});

describe("shouldRunArticle", () => {
  const base = {
    hostname: "example.com",
    settings: settings(),
    sample: () => LONG_EN,
  };

  it("runs when <html lang> matches the learning language, without detecting", async () => {
    const detect = vi.fn(detected("ja"));
    await expect(
      shouldRunArticle({ ...base, htmlLang: "en-US", detect }),
    ).resolves.toBe(true);
    expect(detect).not.toHaveBeenCalled();
  });

  it("does not run when <html lang> names another language", async () => {
    const detect = vi.fn(detected("en"));
    await expect(
      shouldRunArticle({ ...base, htmlLang: "ja", detect }),
    ).resolves.toBe(false);
    expect(detect).not.toHaveBeenCalled();
  });

  it("follows the learning language in the settings", async () => {
    await expect(
      shouldRunArticle({
        ...base,
        settings: settings({ learningLang: "es" }),
        htmlLang: "es-MX",
        detect: detected("en"),
      }),
    ).resolves.toBe(true);
  });

  it.each(["", "  ", "und", "mul", "zxx", "x-custom"])(
    "detects the language when <html lang> is %j",
    async (htmlLang) => {
      await expect(
        shouldRunArticle({ ...base, htmlLang, detect: detected("en") }),
      ).resolves.toBe(true);
      await expect(
        shouldRunArticle({ ...base, htmlLang, detect: detected("ja") }),
      ).resolves.toBe(false);
    },
  );

  it("passes the page sample to the detector", async () => {
    const detect = vi.fn(detected("en"));
    await shouldRunArticle({ ...base, htmlLang: "", detect });
    expect(detect).toHaveBeenCalledWith(LONG_EN);
  });

  it("does not run when the detection is unreliable", async () => {
    await expect(
      shouldRunArticle({
        ...base,
        htmlLang: "",
        detect: detected("en", false),
      }),
    ).resolves.toBe(false);
  });

  it("does not detect on a sample shorter than 200 characters", async () => {
    const detect = vi.fn(detected("en"));
    await expect(
      shouldRunArticle({
        ...base,
        htmlLang: "",
        sample: () => "x".repeat(199),
        detect,
      }),
    ).resolves.toBe(false);
    expect(detect).not.toHaveBeenCalled();
  });

  it("does not run when the detector fails", async () => {
    await expect(
      shouldRunArticle({
        ...base,
        htmlLang: "",
        detect: () => Promise.reject(new Error("no i18n")),
      }),
    ).resolves.toBe(false);
  });

  it("checks the host before the language", async () => {
    const sample = vi.fn(() => LONG_EN);
    await expect(
      shouldRunArticle({
        ...base,
        hostname: "www.youtube.com",
        htmlLang: "",
        sample,
        detect: detected("en"),
      }),
    ).resolves.toBe(false);
    expect(sample).not.toHaveBeenCalled();
  });
});
