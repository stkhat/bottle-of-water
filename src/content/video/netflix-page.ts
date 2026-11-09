/**
 * Runs in netflix.com's own JavaScript world (MAIN), from document_start. It watches
 * `JSON.parse` for the manifests the player reads (each lists the title's subtitle
 * tracks and their download URLs) and answers the content script's calls to Netflix's
 * player API (see `netflix-messages.ts`). `JSON.parse` returns exactly what it would
 * without Lingo, and nothing is stored outside this page's memory: the URLs carry tokens.
 */
import { readManifest, type NetflixTextTrack } from "./netflix-manifest";
import {
  FROM_PAGE,
  isCallMessage,
  type PageCall,
  type ReplyMessage,
  type TracksMessage,
} from "./netflix-messages";
import { netflixPlayer, netflixTitle } from "./netflix-site";

/** Titles whose tracks are kept: the playing one, the next episode (prefetched), a few before. */
const KEEP_TITLES = 6;

let uninstallCurrent: (() => void) | undefined;

/** Installs the hooks once per page; returns a function that removes them (for tests). */
export function installNetflixHooks(
  win: Window & typeof globalThis = window,
): () => void {
  if (uninstallCurrent) return uninstallCurrent;

  const origin = win.location.origin;
  const json = win.JSON;
  const originalParse = json.parse;
  const originalFetch = win.fetch;
  const titles = new Map<string, NetflixTextTrack[]>();

  function seen(movieId: string, tracks: NetflixTextTrack[]) {
    titles.delete(movieId);
    titles.set(movieId, tracks);
    while (titles.size > KEEP_TITLES)
      titles.delete(titles.keys().next().value as string);
    const message: TracksMessage = {
      source: FROM_PAGE,
      type: "tracks",
      movieId,
      tracks,
    };
    win.postMessage(message, origin);
  }

  const parse = function parse(
    this: unknown,
    ...args: Parameters<JSON["parse"]>
  ) {
    const value: unknown = originalParse.apply(this, args);
    try {
      const manifest = readManifest(value);
      if (manifest) seen(manifest.movieId, manifest.tracks);
    } catch {
      // Never disturb the page.
    }
    return value;
  };
  json.parse = parse as JSON["parse"];

  /** A subtitle URL from a manifest seen on this page. */
  const knownUrl = (url: string) =>
    [...titles.values()].some((tracks) =>
      tracks.some((t) => t.downloads.some((d) => d.urls.includes(url))),
    );

  async function answer(call: PageCall): Promise<unknown> {
    switch (call.type) {
      case "getTracks":
        return titles.get(call.movieId) ?? null;
      case "currentMovieId": {
        const id = netflixPlayer(win)?.getMovieId?.();
        return typeof id === "number" || typeof id === "string"
          ? String(id)
          : null;
      }
      case "title":
        return netflixTitle(win, call.movieId) ?? null;
      case "fetchText": {
        if (!knownUrl(call.url)) throw new Error("Not a subtitle URL");
        const response = await originalFetch.call(win, call.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      }
      case "seek": {
        const player = netflixPlayer(win);
        if (!player) throw new Error("No Netflix player");
        player.seek(Math.max(0, Math.round(call.ms)));
        return null;
      }
    }
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== win || event.origin !== origin) return;
    const data: unknown = event.data;
    if (!isCallMessage(data)) return;
    const reply = (fields: Partial<ReplyMessage>) =>
      win.postMessage(
        { source: FROM_PAGE, type: "reply", id: data.id, ...fields },
        origin,
      );
    answer(data.call).then(
      (value) => reply({ ok: true, value }),
      (error: unknown) => reply({ ok: false, error: String(error) }),
    );
  }
  win.addEventListener("message", onMessage);

  uninstallCurrent = () => {
    if (json.parse === parse) json.parse = originalParse;
    win.removeEventListener("message", onMessage);
    titles.clear();
    uninstallCurrent = undefined;
  };
  return uninstallCurrent;
}
