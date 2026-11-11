/**
 * netflix.com's MAIN world, from document_start: watches `JSON.parse` for the manifests
 * the player reads (each lists the title's subtitle tracks and their download URLs) and
 * answers the adapter's calls to Netflix's player API. `JSON.parse` returns exactly what
 * it would without Lingo, and nothing is stored outside this page's memory: the URLs
 * carry tokens.
 */
import { createRecent } from "../recent";
import { installPageScript } from "../page-channel";
import { readManifest, type NetflixTextTrack } from "./manifest";
import { CHANNEL, isCall, type PageCall, type TracksMessage } from "./messages";
import { KEEP_TITLES, netflixPlayer, netflixTitle } from "./site";

export const installNetflixHooks = () =>
  installPageScript<PageCall>(CHANNEL, isCall, install);

function install() {
  const originalParse = JSON.parse;
  const originalFetch = window.fetch;
  const titles = createRecent<NetflixTextTrack[]>(KEEP_TITLES);

  function seen(movieId: string, tracks: NetflixTextTrack[]) {
    titles.set(movieId, tracks);
    const message: TracksMessage = {
      source: CHANNEL.fromPage,
      type: "tracks",
      movieId,
      tracks,
    };
    window.postMessage(message, location.origin);
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
  JSON.parse = parse as JSON["parse"];

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
        const id = netflixPlayer()?.getMovieId?.();
        return typeof id === "number" || typeof id === "string"
          ? String(id)
          : null;
      }
      case "title":
        return netflixTitle(call.movieId) ?? null;
      case "fetchText": {
        if (!knownUrl(call.url)) throw new Error("Not a subtitle URL");
        const response = await originalFetch.call(window, call.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      }
      case "seek": {
        const player = netflixPlayer();
        if (!player) throw new Error("No Netflix player");
        player.seek(Math.max(0, Math.round(call.ms)));
        return null;
      }
    }
  }

  return {
    answer,
    uninstall() {
      if (JSON.parse === parse) JSON.parse = originalParse;
      titles.clear();
    },
  };
}
