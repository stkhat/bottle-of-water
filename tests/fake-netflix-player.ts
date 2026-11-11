// A stand-in for Netflix's web player, for the browser tests (called directly) and the
// E2E tests (passed to `addInitScript`, so it must not use imports or anything outside
// the function). Like the real player as described in docs/notes/netflix.md, it parses
// the title's manifest with `JSON.parse` and offers `window.netflix.appContext.state.
// playerApp.getAPI().videoPlayer`, whose session player seeks in milliseconds. With
// `controlBar` it also plays Netflix's control bar: built while the pointer moves and
// removed from the DOM when it stops, in the structure seen on netflix.com.

export interface FakeNetflixOptions {
  movieId: string;
  /** The manifest's JSON text, parsed once the page is ready. */
  manifest: string;
  /** The player's metadata of the title (`_metadata.video`). */
  metadata?: unknown;
  /** `navigate` changes the URL to /watch/<id> (not in the browser tests' frame). */
  changeUrl?: boolean;
  /**
   * Netflix's control bar, put in `.watch-video--player-view` while the pointer moves
   * and removed `idleMs` after it stops (not while the pointer is over the bar). Each
   * time it is a new subtree. Without it the page has no control bar.
   */
  controlBar?: { idleMs: number; title: string[] };
}

/** The synthetic title's show, as the player's metadata gives it. */
export const FIXTURE_METADATA = {
  title: "Lingo Test Show",
  seasons: [
    {
      seq: 1,
      episodes: [
        { id: 80000001, seq: 1, title: "Pilot" },
        { id: 80000002, seq: 2, title: "Second" },
      ],
    },
  ],
};

/** What the fake records, on `window.lingoFakeNetflix.log`. */
export interface FakeNetflixLog {
  seek: number[];
}

export interface FakeNetflixControl {
  log: FakeNetflixLog;
  /** Plays another title, as Netflix does between episodes: new URL, new manifest. */
  navigate(next: FakeNetflixOptions): void;
  /** Builds the control bar (as a pointer move does) or removes it (as when idle). */
  showControls(on: boolean): void;
  /** The control bar while it is shown. */
  controls(): HTMLElement | null;
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

  // The control bar as seen on netflix.com (2026-11-10): class names are hashed, so
  // only data-uia and the structure count. The right-hand buttons sit in one row,
  // each in its own wrapper, with spacers between them.
  let bar: HTMLElement | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let over = false;
  const div = (className: string, ...children: Node[]) => {
    const element = document.createElement("div");
    element.className = className;
    element.append(...children);
    return element;
  };
  const button = (uia: string, label: string) => {
    const element = document.createElement("button");
    element.setAttribute("data-uia", uia);
    element.setAttribute("aria-label", label);
    return div("default-ltr-iqcdef-cache-1bwyfo4 medium", element);
  };
  const spacer = () => div("default-ltr-iqcdef-cache-1npqywr");
  // The full screen button makes the player's page (.watch-video) fullscreen, and
  // turns into the exit button there.
  const fullscreenLabels = (): [uia: string, label: string] =>
    document.fullscreenElement
      ? ["control-fullscreen-exit", "Exit full screen"]
      : ["control-fullscreen-enter", "Full screen"];
  const fullscreenButton = () => {
    const [uia, label] = fullscreenLabels();
    const wrapper = button(uia, label);
    wrapper.firstElementChild!.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.querySelector(".watch-video")?.requestFullscreen();
    });
    return wrapper;
  };
  function buildBar(title: string[]): HTMLElement {
    const heading = document.createElement("div");
    heading.setAttribute("data-uia", "video-title");
    const [show, ...rest] = title;
    const h4 = document.createElement("h4");
    h4.textContent = show ?? "";
    heading.append(h4);
    for (const part of rest) {
      const span = document.createElement("span");
      span.textContent = part;
      heading.append(span);
    }
    const left = div(
      "default-ltr-iqcdef-cache-1e5rkfb",
      button("control-play-pause-pause", "Pause"),
      spacer(),
      button("control-back10", "Back 10 seconds"),
      spacer(),
      button("control-forward10", "Forward 10 seconds"),
      spacer(),
      button("control-volume-high", "Volume"),
    );
    const right = div(
      "default-ltr-iqcdef-cache-1e5rkfb",
      spacer(),
      button("control-next", "Next Episode"),
      spacer(),
      button("control-episodes", "Episodes"),
      spacer(),
      spacer(),
      button("control-audio-subtitle", "Audio & Subtitles"),
      spacer(),
      button("control-speed", "Playback Speed"),
      spacer(),
      fullscreenButton(),
    );
    const root = div(
      "default-ltr-iqcdef-cache-1h3nesh",
      div(
        "default-ltr-iqcdef-cache-15qqn2w",
        div(
          "default-ltr-iqcdef-cache-13pi6vt",
          div("default-ltr-iqcdef-cache-timeline"),
          div("default-ltr-iqcdef-cache-1t0ry8m", left, heading, right),
        ),
      ),
    );
    root.setAttribute("data-uia", "controls-standard");
    root.addEventListener("pointerenter", () => (over = true));
    root.addEventListener("pointerleave", () => (over = false));
    return root;
  }
  function showControls(on: boolean) {
    clearTimeout(idle);
    if (!on) {
      bar?.remove();
      bar = null;
      over = false;
      return;
    }
    const settings = options.controlBar;
    const view = document.querySelector(".watch-video--player-view");
    if (!settings || !view) return;
    if (!bar) view.append((bar = buildBar(settings.title)));
    const hide = () => {
      if (over) idle = setTimeout(hide, settings.idleMs);
      else showControls(false);
    };
    idle = setTimeout(hide, settings.idleMs);
  }
  if (options.controlBar)
    document.addEventListener(
      "pointermove",
      () => {
        // A fake installed later (the next browser test) has taken over.
        const current = (window as unknown as { lingoFakeNetflix?: unknown })
          .lingoFakeNetflix;
        if (current === control) showControls(true);
      },
      { capture: true, passive: true },
    );

  document.addEventListener("fullscreenchange", () => {
    const shown = bar?.querySelector("[data-uia^='control-fullscreen-']");
    if (!shown) return;
    const [uia, label] = fullscreenLabels();
    shown.setAttribute("data-uia", uia);
    shown.setAttribute("aria-label", label);
  });

  const control: FakeNetflixControl = {
    log,
    navigate(next) {
      if (next.changeUrl !== false)
        history.pushState({}, "", `/watch/${next.movieId}`);
      load(next);
    },
    showControls,
    controls: () => bar,
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
