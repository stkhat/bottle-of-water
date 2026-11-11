import type { VideoHooks } from "./run";
import type { VideoSession } from "./session";
import type { CommentsHooks, CommentsRunner } from "./youtube-comments";

const warn = (error: unknown) => console.warn("Lingo:", error);

/**
 * Runs YouTube's video and comments parts side by side: one dictionary at a time, and a
 * term saved in one part shows in the other.
 */
export async function startYouTubeParts(
  startComments: (hooks: CommentsHooks) => CommentsRunner,
  startVideo: (hooks: VideoHooks) => Promise<VideoSession | undefined>,
): Promise<{ comments: CommentsRunner; video?: VideoSession }> {
  const parts: { video?: VideoSession } = {};
  const comments = startComments({
    onPanelOpen: () => parts.video?.app.closePanel(),
    onTermsChanged: () => void parts.video?.reanalyze().catch(warn),
  });
  parts.video = await startVideo({
    onPanelOpen: () => comments.closePanel(),
    onTermsChanged: () => void comments.reanalyze().catch(warn),
  });
  return { comments, video: parts.video };
}
