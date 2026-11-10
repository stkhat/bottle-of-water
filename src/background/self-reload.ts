import { browser } from "wxt/browser";

/**
 * Dev only (`npm run build:check`): reloads the extension when a new build is copied
 * into its folder. The build writes `build-id.txt` last, so a changed id means the copy
 * is complete. Production builds leave this module out (see the background entrypoint).
 */

/** The file `scripts/build-check.mjs` writes into the build. */
const BUILD_ID_PATH = "/build-id.txt";
/** The `storage.session` key holding the build id this worker started with. */
const SESSION_KEY = "checkBuildId";

export interface WatchBuildOptions {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  reload?: () => void;
  intervalMs?: number;
}

/**
 * Checks the build id once now and then every `intervalMs` while the worker runs, and
 * reloads the extension when it changed. On a worker start it compares the id with the
 * one stored by the previous start (`storage.session` is cleared by a reload), so a build
 * copied in while the worker slept is picked up when it wakes. Returns a stop.
 */
export async function watchBuild(
  options: WatchBuildOptions = {},
): Promise<() => void> {
  const fetchFile = options.fetch ?? ((url, init) => fetch(url, init));
  const reload = options.reload ?? (() => browser.runtime.reload());
  const intervalMs = options.intervalMs ?? 2000;
  const url = (browser.runtime.getURL as (path: string) => string)(
    BUILD_ID_PATH,
  );

  async function read(): Promise<string | undefined> {
    try {
      const response = await fetchFile(url, { cache: "no-store" });
      if (!response.ok) return undefined;
      return (await response.text()).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  let known = await read();
  const stored = (await browser.storage.session.get(SESSION_KEY))[
    SESSION_KEY
  ] as string | undefined;
  if (known !== undefined && stored !== undefined && stored !== known) {
    reload();
    return () => {};
  }
  if (known !== undefined)
    await browser.storage.session.set({ [SESSION_KEY]: known });

  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void read()
      .then(async (id) => {
        if (id === undefined || id === known) return;
        if (known === undefined) {
          known = id;
          await browser.storage.session.set({ [SESSION_KEY]: id });
          return;
        }
        clearInterval(timer);
        reload();
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
