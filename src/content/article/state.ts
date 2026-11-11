import type { TermStatus, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { DictionaryLink } from "../../ui/lookup/externalDictionaries";
import type { TermCard } from "../lookup/describe";
import type { Box } from "../lookup/geometry";
import type { Store } from "../store";

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
}
