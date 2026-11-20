/**
 * Where "Support Langle" leads (ui.md: Toolbar popup, Settings page, Word list page,
 * Video UI). Each stays empty until its page exists (docs/status.md "Before
 * publishing"), and a link whose URL is empty is not shown.
 */

/** "Buy me a coffee": the Ko-fi page. */
const KOFI_URL = "";
/** "Send feedback": a short Google Form. */
export const FEEDBACK_URL = "";
/** "Become a sponsor" / "Sponsor this spot": the page for would-be sponsors. */
export const SPONSOR_PAGE_URL = "";

/** The store listings' review pages (`BrowserEnv.reviewUrl`), known after the first upload. */
export const REVIEW_URLS = {
  /** `https://chromewebstore.google.com/detail/<id>/reviews` */
  chromeWebStore: "",
  /** `https://addons.mozilla.org/firefox/addon/<slug>/reviews/` */
  firefoxAddOns: "",
} as const;

export interface SupportLinks {
  coffee: string;
  feedback: string;
  sponsor: string;
  /** This browser's store review page ("Rate"). */
  review: string;
}

/** The links for this build; `reviewUrl` comes from `BrowserEnv`. */
export function supportLinks(reviewUrl: string): SupportLinks {
  return {
    coffee: KOFI_URL,
    feedback: FEEDBACK_URL,
    sponsor: SPONSOR_PAGE_URL,
    review: reviewUrl,
  };
}
