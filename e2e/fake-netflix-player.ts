// A stand-in for Netflix's web player, for the browser tests (called directly) and the
// E2E tests (passed to `addInitScript`, so it must not use imports or anything outside
// the function). Like the real player as described in docs/notes/netflix.md, it parses
// the title's manifest with `JSON.parse` and offers `window.netflix.appContext.state.
// playerApp.getAPI().videoPlayer`, whose session player seeks in milliseconds.

export interface FakeNetflixOptions {
  movieId: string;
  /** The manifest's JSON text, parsed once the page is ready. */
  manifest: string;
  /** The player's metadata of the title (`_metadata.video`). */
  metadata?: unknown;
  /** `navigate` changes the URL to /watch/<id> (not in the browser tests' frame). */
  changeUrl?: boolean;
}

/** What the fake records, on `window.lingoFakeNetflix.log`. */
export interface FakeNetflixLog {
  seek: number[];
}

export interface FakeNetflixControl {
  log: FakeNetflixLog;
  /** Plays another title, as Netflix does between episodes: new URL, new manifest. */
  navigate(next: FakeNetflixOptions): void;
}

export function installFakeNetflixPlayer(options: FakeNetflixOptions): void {
  let movieId = options.movieId;
  const metadata: Record<string, unknown> = {};
  const log: FakeNetflixLog = { seek: [] };

  const sessionPlayer = {
    seek(ms: number) {
      log.seek.push(ms);
      const video = document.querySelector("video");
      if (video) video.currentTime = ms / 1000;
    },
    getMovieId: () => Number(movieId),
  };

  function load(next: FakeNetflixOptions) {
    movieId = next.movieId;
    if (next.metadata)
      metadata[next.movieId] = { _metadata: { video: next.metadata } };
    // The player reads the manifest with JSON.parse, as the real one does after MSL.
    JSON.parse(next.manifest);
  }

  (window as unknown as Record<string, unknown>).netflix = {
    appContext: {
      state: {
        playerApp: {
          getAPI: () => ({
            videoPlayer: {
              getAllPlayerSessionIds: () => [
                "motion-billboard-1",
                `watch-${movieId}`,
              ],
              getVideoPlayerBySessionId: (id: string) =>
                id.startsWith("watch-") ? sessionPlayer : null,
            },
          }),
          getState: () => ({ videoPlayer: { videoMetadata: metadata } }),
        },
      },
    },
  };

  const control: FakeNetflixControl = {
    log,
    navigate(next) {
      if (next.changeUrl !== false)
        history.pushState({}, "", `/watch/${next.movieId}`);
      load(next);
    },
  };
  (
    window as unknown as { lingoFakeNetflix: FakeNetflixControl }
  ).lingoFakeNetflix = control;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => load(options), {
      once: true,
    });
  else load(options);
}
