import { primary } from "../../core/languages";
import {
  chooseTranslation,
  type TranslationChoice,
} from "../../core/subtitles/translation";
import type { Cue, Track } from "../../core/subtitles/types";
import type { CaptionRequest, VideoCaptions } from "./platform";
import { abortError } from "./recent";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError(signal!));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Hides or shows the site's own captions with a style element of Lingo's. */
export function siteCaptionsHider(id: string, css: string) {
  return (hidden: boolean) => {
    const existing = document.getElementById(id);
    if (!hidden) existing?.remove();
    if (!hidden || existing) return;
    // textContent, not innerHTML: youtube.com enforces Trusted Types.
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (document.head ?? document.documentElement).append(style);
  };
}

/**
 * The first track in this order: `preferred` ones before the others, and within each,
 * the exact language before another region of it (`en-GB` for `en`).
 */
export function pickTrack<T extends { lang: string }>(
  tracks: readonly T[],
  lang: string,
  preferred: (track: T) => boolean,
): T | undefined {
  const exact = (t: T) => t.lang.toLowerCase() === lang.toLowerCase();
  const sameLanguage = (t: T) => primary(t.lang) === primary(lang);
  const order = [
    (t: T) => preferred(t) && exact(t),
    (t: T) => preferred(t) && sameLanguage(t),
    exact,
    sameLanguage,
  ];
  for (const matches of order) {
    const track = tracks.find(matches);
    if (track) return track;
  }
  return undefined;
}

type SiteChoice = Extract<
  TranslationChoice,
  { source: "siteTrack" | "siteAutoTranslate" }
>;

/**
 * The first source in the spec's order ("Choosing a translation") that has cues: a
 * site track or auto-translation that gives none is dropped and the next one tried.
 */
export async function firstTranslation(
  request: CaptionRequest,
  sources: { tracks: Track[]; canAutoTranslate: boolean },
  cuesOf: (choice: SiteChoice) => Promise<Cue[]>,
): Promise<VideoCaptions["translation"]> {
  let { tracks, canAutoTranslate } = sources;
  const lang = request.nativeLang;
  for (;;) {
    request.signal?.throwIfAborted();
    const choice = chooseTranslation({
      tracks,
      nativeLang: lang,
      canAutoTranslate,
      translatorAvailable: request.translatorAvailable,
    });
    if (choice.source === "builtIn" || choice.source === "none")
      return { source: choice.source, lang, cues: [] };
    const cues = await cuesOf(choice);
    if (cues.length > 0) return { source: choice.source, lang, cues };
    if (choice.source === "siteTrack")
      tracks = tracks.filter((t) => t !== choice.track);
    else canAutoTranslate = false;
  }
}
