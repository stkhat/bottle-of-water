import type { SourceInput } from "../../background/term-store";
import type { Settings } from "../../core/settings";
import { findMainContent, type MainContent } from "./main-content";
import type { AcceptText, TextBlock } from "./page-text";
import {
  articlesAllowedOn,
  shouldRunArticle,
  type DetectLanguage,
} from "./should-run";

/** What the page asks of the detector before it runs. */
export interface QualifyInput {
  settings: Settings;
  /** The page text to detect the language on (read only when needed). */
  sample: () => string;
  detect: DetectLanguage;
}

/**
 * Where on a page the article UI runs and what it records: a whole article page by
 * default (`articleSurface`), or one part of a page such as YouTube's comments.
 */
export interface PageSurface {
  /** Whether the UI may run with these settings; checked again after every change. */
  allowed(settings: Settings): boolean;
  /** Whether the page qualifies once allowed (the article's page-language check). */
  qualifies(input: QualifyInput): Promise<boolean>;
  /** Which text nodes are read; every one by default. */
  acceptText?: AcceptText;
  /**
   * The part that counts for highlights, the end-of-page save, the history and the
   * encounters (when Settings say only the article counts); its last block is the end.
   */
  mainContent(root: Element, blocks: readonly TextBlock[]): MainContent;
  /**
   * Each block's language is detected before it is analyzed, and blocks the detector
   * reliably puts in another language are left alone (the page's `lang` says nothing).
   */
  perBlockLanguage?: boolean;
  /** The page or video saved terms, occurrences and history sentences come from. */
  source(): Omit<SourceInput, "lang">;
  /** The URL "Seen elsewhere" leaves out (the source's own). */
  url(): string;
  /** The dictionary panel opened (another of Lingo's windows may close). */
  onPanelOpen?(): void;
  /** A term was saved, changed or removed here (other parts of the page may follow). */
  onTermsChanged?(): void;
}

/** Everything counts, and there is no end to reach. */
export const WHOLE_ROOT: MainContent = {
  contains: () => true,
  last: undefined,
};

/** An article page: the page-language check, its title and body, the page as source. */
export function articleSurface(options: {
  hostname: string;
  htmlLang: string;
}): PageSurface {
  return {
    allowed: (settings) => articlesAllowedOn(options.hostname, settings),
    qualifies: (input) =>
      shouldRunArticle({
        ...input,
        hostname: options.hostname,
        htmlLang: options.htmlLang,
      }),
    mainContent: (root, blocks) => findMainContent(root, blocks),
    source: () => ({
      platform: "web",
      url: location.href,
      title: document.title,
    }),
    url: () => location.href,
  };
}
