import type { LookupHooks } from "../../lookup/lookup";
import { warn } from "../../lookup/warn";
import type { VideoSession } from "../session";
import type { CommentsRunner } from "./comments";

/**
 * Runs YouTube's video and comments parts side by side: one dictionary at a time, and a
 * term saved in one part shows in the other.
 */
export async function startYouTubeParts(
  startComments: (hooks: LookupHooks) => CommentsRunner,
  startVideo: (hooks: LookupHooks) => Promise<VideoSession | undefined>,
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
