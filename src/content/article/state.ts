import type { Span, TermStatus, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { TermBrief } from "../../messaging/protocol";
import type { DictionaryLink } from "../../ui/lookup/externalDictionaries";
import type { TermCard } from "../lookup/describe";
import type { Box } from "../lookup/geometry";
import type { Store } from "../store";
import type { Occurrence, WordsFilter, WordsSort } from "../words/words";
import type { TextBlock } from "./page-text";

/** "Words on this page" while it is open. */
export interface WordsPanel {
  /** The analyzed blocks in scope, in page order, with their spans. */
  blocks: readonly { block: TextBlock; spans: readonly Span[] }[];
  filter: WordsFilter;
  sort: WordsSort;
  /**
   * The last jump: the row (`wordId`) and the place it went to (an index in the row's
   * places). Its row shows selected, its chip pressed.
   */
  jump: { id: string; place: number } | null;
}

/** What the UI shows. */
export interface ArticleState {
  settings: Settings;
  /** The hover card over a word: where the word is and what it says. */
  hover: { anchor: Box; card: TermCard } | null;
  /** The dictionary panel for the clicked word. */
  panel: {
    card: TermCard;
    /** Sentences on this page with the term, in page order. */
    here: string[];
    dictionaries: DictionaryLink[];
    /** The clicked word's boxes, outlined. */
    outline: Box[];
  } | null;
  /**
   * The card over selected words, which saves them as a phrase: the dictionary pattern
   * they stand for ("make up one's mind" for "made up her mind"), else the words.
   */
  phrase: { anchor: Box; card: TermCard } | null;
  /** "Words on this page"; null while closed. */
  words: WordsPanel | null;
  /** Short meanings and statuses of the page's terms, for the Words list. */
  summaries: Record<string, TermBrief>;
  /** The boxes of the place the Words list just went to, outlined for a moment. */
  flash: Box[] | null;
}

/** The UI's view of the page: its state and what its controls do. */
export interface ArticleApp {
  readonly store: Store<ArticleState>;
  /** The hover card's "+ Learning" / "Known". */
  setHoverStatus(status: TermStatus): void;
  /** The pointer entered the hover card: keep it. */
  keepHover(): void;
  /** The pointer left the hover card: hide it soon. */
  releaseHover(): void;
  /** The hover card's "Details": opens the panel for its word. */
  openDetails(): void;
  /** The panel's Learning / Known / Remove. */
  setPanelStatus(status: WordStatus): void;
  speak(): void;
  closePanel(): void;
  /** Scrolls to the panel's "On this page" sentence. */
  goToSentence(index: number): void;
  /** The selection card's "+ Learning" / "Known". */
  savePhrase(status: TermStatus): void;
  /** The selection card's "Details": opens the panel for its phrase. */
  openPhraseDetails(): void;
  /** Opens "Words on this page" (the popup's button), analyzing the whole article. */
  showWords(): void;
  closeWords(): void;
  setWordsFilter(filter: WordsFilter): void;
  setWordsSort(sort: WordsSort): void;
  /**
   * A Words row or one of its chips: scrolls the place to the middle of the view and
   * outlines it for a moment (`id` and `place` are kept for the pressed styles).
   */
  jumpToWord(id: string, place: number, at: Occurrence<TextBlock>): void;
  /** Rows of the Words list came into view: their meanings get translated when needed. */
  wordsShown(rows: readonly { key: string; head: string }[]): void;
}
