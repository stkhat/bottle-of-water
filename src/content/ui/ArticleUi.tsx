import type { ArticleApp } from "../article/article";
import { shownStatus } from "../article/describe";
import type { Box } from "../article/geometry";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { PhraseBar } from "../../ui/lookup/PhraseBar";
import { color } from "../../ui/lookup/styles";
import { ThemeScope } from "../../ui/ThemeScope";
import { Floating } from "./Floating";
import { useStore } from "./store";

const TOP_LAYER = 2147483647;

/** Mock Article: the dictionary panel sits 16px in from the top right. */
const CARD_INSET = 16;

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
export function ArticleUi({ app }: { app: ArticleApp }) {
  const { settings, hover, panel, phrase } = useStore(app.store);

  return (
    <ThemeScope theme={settings.theme}>
      {panel && (
        <>
          {panel.outline.map((box, i) => (
            <Outline key={i} box={box} />
          ))}
          <DictionaryWindow
            variant="panel"
            frame={{ top: CARD_INSET, right: CARD_INSET, bottom: CARD_INSET }}
            entry={{
              head: panel.card.head,
              kind: panel.card.kind,
              ipa: panel.card.ipa,
              sub: panel.card.sub,
              short: panel.card.short,
              senses: panel.card.senses,
              glossLang: panel.card.glossLang,
            }}
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
            kind={hover.card.kind}
            status={shownStatus(hover.card)}
            head={hover.card.head}
            ipa={hover.card.ipa}
            short={hover.card.short}
            glossLang={hover.card.glossLang}
            sub={hover.card.sub}
            nativeLang={settings.nativeLang}
            onLearning={() => app.setHoverStatus("learning")}
            onKnown={() => app.setHoverStatus("known")}
            onDetails={app.openDetails}
          />
        </Floating>
      )}
      {phrase && (
        // Pressing the bar's buttons must not clear the page's selection.
        <Floating anchor={phrase.anchor} onMouseDown={keepSelection}>
          <PhraseBar
            text={phrase.text}
            onLearning={() => app.savePhrase("learning")}
            onKnown={() => app.savePhrase("known")}
          />
        </Floating>
      )}
    </ThemeScope>
  );
}

const keepSelection = (event: MouseEvent) => event.preventDefault();
