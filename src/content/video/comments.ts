import { hostBlocked, type Settings } from "../../core/settings";

/** A comment's text on a YouTube watch page (its replies' too). */
export const COMMENT_TEXT = "#content-text";

/** The comment section under the video (not the hidden engagement-panel copy). */
export const COMMENTS_ROOT = "ytd-comments#comments";

/**
 * Whether Lingo runs in YouTube's comments: YouTube and its comments are switched on
 * and the host is not blocked. The player's L button does not matter.
 */
export function commentsAllowedOn(
  hostname: string,
  settings: Settings,
): boolean {
  return (
    settings.sites.youtube &&
    settings.sites.youtubeComments &&
    !hostBlocked(hostname, settings)
  );
}

/** True for text inside a comment's body, so names, times and buttons are never read. */
export function isCommentText(node: Text): boolean {
  return node.parentElement?.closest(COMMENT_TEXT) != null;
}
