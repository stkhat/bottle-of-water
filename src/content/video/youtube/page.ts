/**
 * youtube.com's MAIN world, from document_start: posts the player's /api/timedtext
 * responses and answers the adapter's calls to the player API. Requests and responses
 * pass through unchanged. No dependencies: this code runs inside the page.
 */
import { installPageScript } from "../page-channel";
import {
  CHANNEL,
  isCall,
  type PageCall,
  type PageCallResults,
  type TimedtextMessage,
} from "./messages";

/** The parts of YouTube's player API (on `#movie_player` and `#shorts-player`) Langle calls. */
interface PlayerApi {
  getPlayerResponse?(): { videoDetails?: unknown; captions?: unknown } | null;
  getVideoData?(): { video_id?: string } | null;
  loadModule?(name: string): void;
  unloadModule?(name: string): void;
  getOption?(module: string, key: string): unknown;
  setOption?(module: string, key: string, value: unknown): void;
  seekTo?(seconds: number, allowSeekAhead?: boolean): void;
  pauseVideo?(): void;
  playVideo?(): void;
}

const TIMEDTEXT_PATH = "/api/timedtext";

interface CaptionTrackOption {
  languageCode?: string;
  kind?: string;
  translationLanguage?: { languageCode?: string } | null;
}

/**
 * The storage entries where the player keeps its caption choice for the next load of the
 * page (`yt-player-caption-sticky-language`, `yt-player-caption-persistence`: written when
 * Langle set a track, seen 2026-11-18; docs/notes/youtube-captions.md).
 */
const CAPTION_CHOICE_KEY = /^yt-player-.*caption/;

export const installYouTubeHooks = () =>
  installPageScript<PageCall>(CHANNEL, isCall, install);

function install() {
  const origin = location.origin;
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  const originalFetch = window.fetch;
  const openedUrls = new WeakMap<XMLHttpRequest, string>();

  /** The absolute URL when it is a same-origin /api/timedtext request. */
  function timedtextUrl(url: string): URL | undefined {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === origin && parsed.pathname === TIMEDTEXT_PATH
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }

  function post(url: URL, body: string) {
    const q = url.searchParams;
    const message: TimedtextMessage = {
      source: CHANNEL.fromPage,
      type: "timedtext",
      url: url.href,
      videoId: q.get("v"),
      lang: q.get("lang"),
      tlang: q.get("tlang"),
      kind: q.get("kind"),
      body,
    };
    window.postMessage(message, origin);
  }

  function xhrBody(xhr: XMLHttpRequest): string {
    switch (xhr.responseType) {
      case "":
      case "text":
        return xhr.responseText;
      case "json":
        return xhr.response === null ? "" : JSON.stringify(xhr.response);
      case "arraybuffer":
        return xhr.response instanceof ArrayBuffer
          ? new TextDecoder().decode(xhr.response)
          : "";
      default:
        return "";
    }
  }

  XHR.open = function open(
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    openedUrls.set(this, String(args[1]));
    return originalOpen.apply(this, args as Parameters<typeof originalOpen>);
  } as typeof XHR.open;

  XHR.send = function send(
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    const opened = openedUrls.get(this);
    const url = opened === undefined ? undefined : timedtextUrl(opened);
    if (url) {
      this.addEventListener("load", () => {
        try {
          post(url, xhrBody(this));
        } catch {
          // Never disturb the player.
        }
      });
    }
    return originalSend.apply(this, args);
  };

  window.fetch = function fetch(
    this: unknown,
    ...args: Parameters<typeof window.fetch>
  ) {
    const result = originalFetch.apply(this, args);
    const [input] = args;
    const url = timedtextUrl(
      input instanceof Request ? input.url : String(input),
    );
    if (url) {
      result
        .then((response) => response.clone().text())
        .then((body) => post(url, body))
        .catch(() => {});
    }
    return result;
  } as typeof window.fetch;

  // The watch page's player can stay in the DOM while a Short shows, and the other way round.
  const player = (call: PageCall) =>
    document.getElementById(call.shorts ? "shorts-player" : "movie_player") as
      (HTMLElement & PlayerApi) | null;

  /** A plain copy that survives postMessage (player objects may hold functions). */
  const plain = (value: unknown): unknown =>
    value === undefined ? null : JSON.parse(JSON.stringify(value));

  /** The player's caption choice in each storage, as it was before Langle asked for a track. */
  let keptChoice: { storage: Storage; entries: [string, string][] }[] | null =
    null;

  function storages(): Storage[] {
    const found: Storage[] = [];
    for (const get of [() => localStorage, () => sessionStorage]) {
      try {
        found.push(get());
      } catch {
        // Blocked site data: nothing kept there.
      }
    }
    return found;
  }

  const choiceKeys = (storage: Storage) =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
      (key): key is string => key !== null && CAPTION_CHOICE_KEY.test(key),
    );

  function keepChoice() {
    if (keptChoice) return;
    keptChoice = [];
    for (const storage of storages()) {
      try {
        const entries = choiceKeys(storage).map(
          (key) => [key, storage.getItem(key) ?? ""] as [string, string],
        );
        keptChoice.push({ storage, entries });
      } catch {
        // Unreadable: left as it is.
      }
    }
  }

  /**
   * Puts the caption choice back: the next load of the page would otherwise start with
   * Langle's track on, which the player shows without a request Langle can capture.
   */
  function restoreChoice() {
    const kept = keptChoice;
    keptChoice = null;
    for (const { storage, entries } of kept ?? []) {
      try {
        const before = new Map(entries);
        for (const key of choiceKeys(storage))
          if (!before.has(key)) storage.removeItem(key);
        for (const [key, value] of entries)
          if (storage.getItem(key) !== value) storage.setItem(key, value);
      } catch {
        // Never disturb the page.
      }
    }
  }

  const sameTrack = (
    track: CaptionTrackOption | null | undefined,
    languageCode: string,
    asr: boolean,
  ) =>
    track?.languageCode === languageCode &&
    (track.kind === "asr") === asr &&
    !track.translationLanguage?.languageCode;

  async function answer(call: PageCall): Promise<unknown> {
    const api = player(call);
    switch (call.type) {
      case "getPlayerResponse": {
        const response = api?.getPlayerResponse?.();
        return response
          ? plain({
              videoDetails: response.videoDetails,
              captions: response.captions,
            })
          : null;
      }
      case "videoId":
        return api?.getVideoData?.()?.video_id ?? null;
      case "loadTrack": {
        if (!api?.setOption) throw new Error("No player");
        keepChoice();
        api.loadModule?.("captions");
        const current = api.getOption?.("captions", "track") as
          CaptionTrackOption | undefined;
        const previous = plain(current ?? {});
        // Setting the track already on does nothing, and the player can show it without
        // having requested it (a load that starts with it on): switch captions off
        // first, so that setting it requests it.
        if (sameTrack(current, call.languageCode, call.asr)) {
          api.unloadModule?.("captions");
          api.loadModule?.("captions");
        }
        const list = api.getOption?.("captions", "tracklist");
        const tracks = Array.isArray(list)
          ? (list as CaptionTrackOption[])
          : [];
        const track = tracks.find(
          (t) =>
            t.languageCode === call.languageCode &&
            (t.kind === "asr") === call.asr,
        ) ?? {
          languageCode: call.languageCode,
          kind: call.asr ? "asr" : "",
        };
        api.setOption("captions", "track", track);
        return { previous } satisfies PageCallResults["loadTrack"];
      }
      case "restoreCaptions": {
        const previous = call.previous as CaptionTrackOption | null;
        if (previous && typeof previous.languageCode === "string")
          api?.setOption?.("captions", "track", previous);
        else api?.unloadModule?.("captions");
        restoreChoice();
        return null;
      }
      case "fetchTimedtext": {
        const url = timedtextUrl(call.url);
        if (!url) throw new Error("Not a timedtext URL");
        const response = await originalFetch.call(window, url.href, {
          credentials: "same-origin",
        });
        return response.text();
      }
      case "seek":
        api?.seekTo?.(call.seconds, true);
        return null;
      case "pause":
        api?.pauseVideo?.();
        return null;
      case "play":
        api?.playVideo?.();
        return null;
    }
  }

  return {
    answer,
    uninstall() {
      XHR.open = originalOpen;
      XHR.send = originalSend;
      window.fetch = originalFetch;
    },
  };
}
