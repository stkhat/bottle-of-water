import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { unsupportedPage } from "../../messaging/page-protocol";
import type { LookupHooks } from "../lookup/lookup";
import { warn } from "../lookup/warn";
import { leaveWhenOrphaned } from "../orphan";
import { answerPageRequests, contentDeps } from "../wiring";
import { mountVideoUi } from "./mount";
import type { PlatformAdapter } from "./platform";
import { startVideo, type VideoSession } from "./session";

/**
 * The content script of a video site: runs the video session through the site's
 * adapter, mounts its UI, and answers the popup about the video. Everything is taken
 * down when the extension's context goes away. Resolves the session once it runs.
 */
export async function runVideoSite(
  ctx: ContentScriptContext,
  adapter: PlatformAdapter,
  hooks: LookupHooks = {},
): Promise<VideoSession | undefined> {
  leaveWhenOrphaned(ctx);
  const started = startVideo({
    ...contentDeps(ctx),
    adapter,
    ...hooks,
  }).catch((error: unknown) => {
    warn(error);
    return undefined;
  });

  answerPageRequests(ctx, async (request) => {
    const session = await started;
    return session
      ? session.handlePageRequest(request)
      : unsupportedPage(location.hostname, "video");
  });

  const session = await started;
  if (!session) {
    adapter.dispose();
    return undefined;
  }
  const unmount = mountVideoUi({ adapter, app: session.app });
  ctx.onInvalidated(() => {
    unmount();
    session.stop();
    adapter.dispose();
  });
  return session;
}
