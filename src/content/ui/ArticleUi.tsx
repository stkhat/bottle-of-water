import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ArticleApp } from "../article/article";
import type { Box } from "../article/geometry";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { PhraseBar } from "../../ui/lookup/PhraseBar";
import { color } from "../../ui/lookup/styles";
import { PageCard } from "./PageCard";
import { useStore } from "./store";

const TOP_LAYER = 2147483647;

/** Mock Article: the page card sits 16px in from the top right... */
const CARD_INSET = 16;
/** ...and the dictionary panel 152px below the card's top (mock: 84 → 236). */
const PANEL_TOP = CARD_INSET + 152;

/** Gap between a word and the card or bar above it, and their shift left (mock `.pop`). */
const GAP = 10;
/** Closest a floating card comes to the viewport's edges. */
const EDGE = 8;

interface FloatingProps {
  anchor: Box;
  children: ComponentChildren;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onMouseDown?: (event: MouseEvent) => void;
}

/**
 * Places its content 10px above the anchor and 10px left of it, like the mock's
 * word popups; below the anchor when there is no room above. Kept inside the viewport.
 */
function Floating(props: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { anchor } = props;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(
      EDGE,
      Math.min(anchor.left - GAP, innerWidth - width - EDGE),
    );
    const above = anchor.top - GAP - height;
    const top = above >= EDGE ? above : anchor.bottom + GAP;
    if (pos?.left !== left || pos.top !== top) setPos({ left, top });
  });

  return (
    <div
      ref={ref}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
      onMouseDown={props.onMouseDown}
      style={{
        position: "fixed",
        zIndex: TOP_LAYER,
        left: `${pos?.left ?? 0}px`,
        top: `${pos?.top ?? 0}px`,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {props.children}
    </div>
  );
}

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
  const state = useStore(app.store);
  const { settings, hover, panel, phrase } = state;

  return (
    <>
      <PageCard highlight={settings.highlight} onToggle={app.toggleHighlight} />
      {panel && (
        <>
          {panel.outline.map((box, i) => (
            <Outline key={i} box={box} />
          ))}
          <DictionaryWindow
            variant="panel"
            frame={{ top: PANEL_TOP, right: CARD_INSET, bottom: CARD_INSET }}
            entry={{
              head: panel.card.head,
              kind: panel.card.kind,
              ipa: panel.card.ipa,
              sub: panel.card.sub,
              short: panel.card.short,
              senses: panel.card.senses,
            }}
            nativeLang={settings.nativeLang}
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
            elsewhere={
              panel.card.status === "new"
                ? null
                : elsewhereItems(panel.card.elsewhere)
            }
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
            status={hover.card.status}
            head={hover.card.head}
            ipa={hover.card.ipa}
            short={hover.card.short}
            sub={hover.card.sub}
            nativeLang={settings.nativeLang}
            onLearning={() => app.setHoverStatus("learning")}
            onKnown={() => app.setHoverStatus("known")}
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
    </>
  );
}

const keepSelection = (event: MouseEvent) => event.preventDefault();
