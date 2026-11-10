import type { Settings } from "../../core/settings";
import { onHost } from "../../core/url";
import { isGenericLang, matchesLearningLanguage } from "../page-language";

export { onHost };

/** `i18n.detectLanguage`, passed in so the decision stays testable. */
export type DetectLanguage = (text: string) => Promise<{
  isReliable: boolean;
  languages: { language: string; percentage: number }[];
}>;

/** The video UI owns these sites (and their subdomains). */
const VIDEO_SITES = ["youtube.com", "netflix.com"];

/** The shortest text sample the language is detected on. */
export const MIN_DETECT_SAMPLE = 200;

/** The host is in `neverRunOn` or `disabledSites` (an entry covers its subdomains too). */
export function hostBlocked(hostname: string, settings: Settings): boolean {
  return [...settings.neverRunOn, ...settings.disabledSites].some((entry) =>
    onHost(hostname, entry),
  );
}

/** The video UI owns this host (YouTube, Netflix and their subdomains). */
export const isVideoSite = (hostname: string): boolean =>
  VIDEO_SITES.some((entry) => onHost(hostname, entry));

/**
 * Whether the article UI may run on a host, before the page language is known: not on
 * the video sites, not when articles are off, not on hosts in `neverRunOn` or
 * `disabledSites` (an entry covers its subdomains too).
 */
export function articlesAllowedOn(
  hostname: string,
  settings: Settings,
): boolean {
  if (!settings.sites.articles) return false;
  return !isVideoSite(hostname) && !hostBlocked(hostname, settings);
}

export interface RunInput {
  hostname: string;
  /** `<html lang>`. */
  htmlLang: string;
  settings: Settings;
  /** The page text to detect the language on; read only when `<html lang>` is generic. */
  sample: () => string;
  detect: DetectLanguage;
}

/**
 * Whether the article UI runs on this page: the host is allowed and the page is in
 * the learning language. The language is `<html lang>`, or when that is missing or
 * generic, the detector's reliable answer on a sample of at least 200 characters.
 */
export async function shouldRunArticle(input: RunInput): Promise<boolean> {
  const { settings } = input;
  if (!articlesAllowedOn(input.hostname, settings)) return false;
  if (!isGenericLang(input.htmlLang))
    return matchesLearningLanguage(input.htmlLang, settings.learningLang);

  const sample = input.sample();
  if (sample.length < MIN_DETECT_SAMPLE) return false;
  try {
    const { isReliable, languages } = await input.detect(sample);
    const top = languages[0]?.language;
    return isReliable && matchesLearningLanguage(top, settings.learningLang);
  } catch {
    return false;
  }
}
