import { useMemo } from "preact/hooks";
import type { ArticleApp, ArticleState, WordsPanel } from "./state";
import { hoverView, windowView } from "../lookup/describe";
import type { Box } from "../lookup/geometry";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { color } from "../../ui/styles";
import { ThemeScope } from "../../ui/ThemeScope";
import {
  PageWordsPanel,
  WORDS_PANEL_INSET,
  WORDS_PANEL_WIDTH,
} from "../../ui/words/PageWordsPanel";
import { Floating, TOP_LAYER } from "../lookup/Floating";
import { useStore } from "../store";
import {
  filterCounts,
  filterRows,
  listWords,
  sortRows,
  wordId,
} from "../words/words";

/** Mock Article: the dictionary panel sits 16px in from the top right. */
const CARD_INSET = 16;

/** Where the dictionary panel's edges are, in px from the viewport's edges. */
export interface PanelFrame {
  top: number;
  right: number;
  bottom: number;
}

const DEFAULT_FRAME: PanelFrame = {
  top: CARD_INSET,
  right: CARD_INSET,
  bottom: CARD_INSET,
};

/** While "Words on this page" is open, the dictionary panel opens left of it. */
const BESIDE_WORDS: PanelFrame = {
  ...DEFAULT_FRAME,
  right: WORDS_PANEL_INSET + WORDS_PANEL_WIDTH + CARD_INSET,
};

/** The mock's selected word: a 2px green outline 2px outside the word's box. */
function Outline({ box }: { box: Box }) {
  return (
    <div
      data-outline
      style={{
        position: "fixed",
        zIndex: TOP_LAYER,
        pointerEvents: "none",
        boxSizing: "border-box",
        left: `${box.left - 4}px`,
        top: `${box.top - 4}px`,
        width: `${box.right - box.left + 8}px`,
        height: `${box.bottom - box.top + 8}px`,
        border: `2px solid ${color.green}`,
        borderRadius: "6px",
      }}
    ></div>
  );
}

/** Everything Lingo shows on an article page, inside its shadow root. */
export function ArticleUi({
  app,
  panelFrame,
}: {
  app: ArticleApp;
  /** Where the dictionary panel goes when not at the top right (Shorts' comments). */
  panelFrame?: () => PanelFrame | null;
}) {
  const state = useStore(app.store);
  const { settings, hover, panel, phrase, words, flash } = state;

  return (
    <ThemeScope theme={settings.theme}>
      {words && <Words app={app} state={state} words={words} />}
      {flash?.map((box, i) => (
        <Outline key={`flash${i}`} box={box} />
      ))}
      {panel && (
        <>
          {panel.outline.map((box, i) => (
            <Outline key={i} box={box} />
          ))}
          <DictionaryWindow
            variant="panel"
            frame={panelFrame?.() ?? (words ? BESIDE_WORDS : DEFAULT_FRAME)}
            entry={windowView(panel.card)}
            nativeLang={settings.nativeLang}
            learningLang={settings.learningLang}
            status={panel.card.status}
            onStatus={app.setPanelStatus}
            onSpeak={app.speak}
            dictionaries={panel.dictionaries}
            here={{
              source: "page",
              items: panel.here.map((text, i) => ({
                text,
                onClick: () => app.goToSentence(i),
              })),
            }}
            elsewhere={elsewhereItems(panel.card.elsewhere, Date.now())}
            onClose={app.closePanel}
          />
        </>
      )}
      {hover && (
        <Floating
          anchor={hover.anchor}
          onPointerEnter={app.keepHover}
          onPointerLeave={app.releaseHover}
        >
          <HoverCard
            variant="article"
            {...hoverView(hover.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.setHoverStatus("learning")}
            onKnown={() => app.setHoverStatus("known")}
            onDetails={app.openDetails}
          />
        </Floating>
      )}
      {phrase && (
        // Pressing the card's buttons must not clear the page's selection.
        <Floating anchor={phrase.anchor} onMouseDown={keepSelection}>
          <HoverCard
            variant="article"
            selection
            {...hoverView(phrase.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.savePhrase("learning")}
            onKnown={() => app.savePhrase("known")}
            onDetails={app.openPhraseDetails}
          />
        </Floating>
      )}
    </ThemeScope>
  );
}

const keepSelection = (event: MouseEvent) => event.preventDefault();

/** "Words on this page": the rows of the analyzed article, as the filter and sort say. */
function Words(props: {
  app: ArticleApp;
  state: ArticleState;
  words: WordsPanel;
}) {
  const { app, words } = props;
  const { summaries, settings } = props.state;
  const all = useMemo(
    () =>
      listWords(
        words.blocks.map(({ block, spans }) => ({
          unit: block,
          text: block.text,
          spans,
        })),
        summaries,
      ),
    [words.blocks, summaries],
  );
  const { jump } = words;
  const rows = useMemo(
    () =>
      sortRows(
        filterRows(
          all.map((word) => ({ ...word, count: word.places.length })),
          words.filter,
        ),
        words.sort,
        settings.learningLang,
      ).map((word) => {
        const id = wordId(word);
        const brief = Object.hasOwn(summaries, word.key)
          ? summaries[word.key]
          : undefined;
        return {
          id,
          key: word.key,
          head: word.head,
          category: word.category,
          count: word.count,
          short: brief?.short,
          shortLang: brief?.glossLang ?? settings.nativeLang,
          places: word.places.map((_, i) => String(i + 1)),
          pressed: jump?.id === id ? jump.place : -1,
          occurrences: word.places,
        };
      }),
    [
      all,
      words.filter,
      words.sort,
      summaries,
      settings.learningLang,
      settings.nativeLang,
      jump,
    ],
  );
  const counts = useMemo(() => filterCounts(all), [all]);
  return (
    <PageWordsPanel
      rows={rows}
      filter={words.filter}
      counts={counts}
      onFilter={app.setWordsFilter}
      sort={words.sort}
      onSort={app.setWordsSort}
      onJump={(row, place) =>
        app.jumpToWord(row.id, place, row.occurrences[place]!)
      }
      onShown={(shown) =>
        app.wordsShown(shown.map(({ key, head }) => ({ key, head })))
      }
      learningLang={settings.learningLang}
      onClose={app.closeWords}
    />
  );
}
