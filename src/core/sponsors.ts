/**
 * The card at the bottom of the word list's details (ui.md "Word list page";
 * architecture.md "Chrome Web Store requirements": Ads). Its data ships in the release:
 * nothing is fetched, nothing is tracked, and the card opens its link only when clicked.
 */
export interface SponsorCard {
  /**
   * `sponsor`: a direct sponsor, labelled "Sponsored". `affiliate`: an affiliate
   * program's link, labelled "Ad" with the commission line.
   */
  type: "sponsor" | "affiliate";
  name: string;
  /** One line about it, up to 80 characters. */
  line: string;
  url: string;
  /** Its logo, a file under `public/` (e.g. `sponsors/<name>.png`); none: no logo. */
  logo?: string;
}

/** The card this release bundles; null: the spot is open. */
export const SPONSOR_CARD: SponsorCard | null = null;

/**
 * Where the card leads: a sponsor's URL with `utm_source=langle`, an affiliate's as
 * the program gave it (its tracking parameters are the program's).
 */
export function cardHref(card: SponsorCard): string {
  if (card.type === "affiliate") return card.url;
  const url = new URL(card.url);
  url.searchParams.set("utm_source", "langle");
  return url.href;
}
