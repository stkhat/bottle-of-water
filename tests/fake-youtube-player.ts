// A stand-in for YouTube's player API on `#movie_player` (or Shorts' `#shorts-player`), for the browser tests (called
// directly) and the E2E tests (passed to `addInitScript`, so it must not use imports or
// anything outside the function). It behaves like the parts of the real player Lingo
// uses (see docs/notes/youtube-captions.md): `setOption("captions", "track", …)` makes
// an XMLHttpRequest to the track's `baseUrl` plus a PO token and client params.

export interface FakePlayerOptions {
  videoId: string;
  title: string;
  /** A player response with `captions` (like `captionTracks.json`). */
  playerResponse: unknown;
  /** The player requests the first caption track itself once the video plays. */
  captionsOn?: boolean;
  /** The player element's id. Default: `shorts-player` on a Short's URL, else `movie_player`. */
  playerId?: string;
}

/** What the fake records, on `player.fake`. */
export interface FakePlayerLog {
  setOption: unknown[][];
  unloadModule: string[];
  seekTo: number[];
  /** `pauseVideo` and `playVideo` calls, in order. */
  playback: ("pause" | "play")[];
  requests: string[];
}

export function installFakeYouTubePlayer(options: FakePlayerOptions): void {
  interface RawTrack {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId?: string;
    name?: { simpleText?: string };
  }
  interface TrackOption {
    languageCode?: string;
    kind?: string;
    translationLanguage?: { languageCode: string };
  }

  const setup = () => {
    const player = document.getElementById(
      options.playerId ??
        (location.pathname.startsWith("/shorts/")
          ? "shorts-player"
          : "movie_player"),
    ) as (HTMLElement & Record<string, unknown>) | null;
    if (!player) return;
    const video = player.querySelector("video");
    let videoId = options.videoId;
    let title = options.title;
    let response = options.playerResponse as {
      captions?: {
        playerCaptionsTracklistRenderer?: { captionTracks?: RawTrack[] };
      };
    };
    let track: TrackOption = {};
    const log: FakePlayerLog = {
      setOption: [],
      unloadModule: [],
      seekTo: [],
      playback: [],
      requests: [],
    };

    const captionTracks = () =>
      response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    function request(option: TrackOption) {
      const raw = captionTracks().find(
        (t) =>
          t.languageCode === option.languageCode &&
          (t.kind ?? "") === (option.kind ?? ""),
      );
      if (!raw) return;
      const base = new URL(raw.baseUrl, location.href);
      const url = new URL(base.pathname + base.search, location.origin);
      url.searchParams.set("potc", "1");
      url.searchParams.set("pot", "FAKE-PO-TOKEN");
      url.searchParams.set("fmt", "json3");
      if (option.translationLanguage)
        url.searchParams.set("tlang", option.translationLanguage.languageCode);
      url.searchParams.set("c", "WEB");
      url.searchParams.set("cplayer", "UNIPLAYER");
      log.requests.push(url.href);
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url.href);
      xhr.send();
    }

    function setOption(module: string, key: string, value: TrackOption) {
      log.setOption.push([module, key, value]);
      if (module !== "captions" || key !== "track") return;
      track = value;
      if (value.languageCode) request(value);
    }

    Object.assign(player, {
      fake: log,
      getPlayerResponse: () => ({
        videoDetails: { videoId, title },
        captions: response.captions,
      }),
      getVideoData: () => ({ video_id: videoId, title }),
      loadModule() {},
      unloadModule(name: string) {
        log.unloadModule.push(name);
        if (name === "captions") track = {};
      },
      getOption(module: string, key: string) {
        if (module !== "captions") return undefined;
        if (key === "track") return track;
        if (key === "tracklist")
          return captionTracks().map((t) => ({
            languageCode: t.languageCode,
            languageName: t.name?.simpleText ?? t.languageCode,
            kind: t.kind ?? "",
            vss_id: t.vssId ?? "",
          }));
        return undefined;
      },
      setOption,
      seekTo(seconds: number) {
        log.seekTo.push(seconds);
        if (video) video.currentTime = seconds;
      },
      pauseVideo() {
        log.playback.push("pause");
        video?.pause();
      },
      playVideo() {
        log.playback.push("play");
        void video?.play().catch(() => {});
      },
      /** Switches to another video as YouTube's SPA navigation does. */
      fakeNavigate(next: {
        videoId: string;
        title: string;
        playerResponse: unknown;
      }) {
        videoId = next.videoId;
        title = next.title;
        response = next.playerResponse as typeof response;
        track = {};
        document.dispatchEvent(
          new CustomEvent("yt-navigate-finish", {
            detail: {
              response: {
                playerResponse: { videoDetails: { videoId, title } },
              },
            },
          }),
        );
      },
    });

    // The full screen button, as on youtube.com: the whole app (ytd-app) goes
    // fullscreen, and the watch page lays the player over the screen.
    const fullscreenButton = player.querySelector(".ytp-fullscreen-button");
    fullscreenButton?.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void (player.closest("ytd-app") ?? player).requestFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement !== null;
      player.closest("ytd-watch-flexy")?.toggleAttribute("fullscreen", on);
      fullscreenButton?.setAttribute(
        "aria-label",
        on ? "Exit full screen (f)" : "Full screen (f)",
      );
    });

    if (options.captionsOn && video) {
      video.addEventListener(
        "playing",
        () => {
          const first = captionTracks()[0];
          if (first)
            setOption("captions", "track", {
              languageCode: first.languageCode,
              kind: first.kind ?? "",
            });
        },
        { once: true },
      );
    }
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
}
