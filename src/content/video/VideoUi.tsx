import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useReducer } from "preact/hooks";
import { fromUser } from "../../ui/from-user";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { keptOpen } from "../../ui/keep-open";
import type { SelectedOffsets } from "../../ui/selection-in-root";
import {
  pressedOnText,
  type SelectedText,
} from "../../ui/video/text-selection";
import { formatTime } from "../../ui/format/format";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { LingoMenu } from "../../ui/video/LingoMenu";
import { PlayerButtons } from "../../ui/video/PlayerButtons";
import { SubtitleOverlay } from "../../ui/video/SubtitleOverlay";
import { VideoPanel } from "../../ui/video/VideoPanel";
import { ThemeScope } from "../../ui/ThemeScope";
import { hoverView, windowView } from "../lookup/describe";
import { boxOf, type Box } from "../lookup/geometry";
import {
  dictionaryFrame,
  menuBelowPlacement,
  menuPlacement,
  verticalDictionaryFrame,
} from "./placement";
import type { VideoApp, VideoState, WordPlace } from "./state";
import { filterCounts, filterRows, videoWords } from "./words";
import { Floating, TOP_LAYER } from "../lookup/Floating";
import { useStore, type Store } from "../store";

/** Where the parts of the page are, read when needed. */
export interface VideoGeometry {
  player(): Box | null;
  /** The L and ^ buttons. */
  buttons(): Box | null;
  /** Lingo's transcript, while it shows. */
  transcript(): Box | null;
  /** What the dictionary window goes to the right of beside a vertical video. */
  beside(): Box | null;
}

/** Sizes the UI follows. */
export interface VideoLayout {
  /** The height of the element the transcript follows (the player, or the site's frame). */
  frameHeight: number;
  /**
   * How far above the player's bottom the in-video subtitle sits (px): 64, or higher
   * while the site's control bar shows (Netflix).
   */
  subtitleBottom: number;
  /** A vertical short video (spec "YouTube Shorts"): subtitle only, in the video. */
  vertical: boolean;
  /**
   * The transcript is in the sidebar beside a player that fills the window or the
   * screen (Netflix; YouTube in fullscreen), the player narrowed for it.
   */
  sidebar: boolean;
}

/** Mock Main: the in-video subtitle sits 64px above the player's bottom. */
export const SUBTITLE_BOTTOM = 64;
/** Mock Fullscreen: the subtitle sits 120px above the screen's bottom. */
const FULLSCREEN_SUBTITLE_BOTTOM = 120;
/** Mock Fullscreen: 200px in from each side of the 1440px screen, less on small ones. */
const FULLSCREEN_SUBTITLE_INSET = "clamp(24px, 14%, 200px)";
/** Mock Main: 120px in from each side of the 880px video, less on small players. */
const SUBTITLE_INSET = "clamp(12px, calc((100% - 640px) / 2), 120px)";
/** Mock `YouTube Shorts — subtitles`: 132px above the video's bottom, over its title. */
const VERTICAL_SUBTITLE_BOTTOM = 132;
/** Mock `YouTube Shorts — subtitles`: 12px in from each side of the narrow video. */
const VERTICAL_SUBTITLE_INSET = "12px";
/** The gap kept between the in-video subtitle and the site's control bar (px). */
export const CONTROL_BAR_GAP = 12;

/** The transcript is never shorter than this (px). */
const MIN_TRANSCRIPT_HEIGHT = 320;
/** Lingo shows its subtitles and transcript for this video. */
const showing = (state: VideoState) =>
  state.enabled && state.status === "ready";

/**
 * The playing line: its part of the card's text, and the card's spans in it (cut to the
 * line), with their indices in the card's spans.
 */
function playingLine(state: VideoState) {
  const line = state.lines[state.line];
  const cue = line ? state.cues[line.card] : undefined;
  if (!line || !cue) return undefined;
  const spans = state.spans[line.card] ?? null;
  const shown = (spans ?? []).flatMap((span, index) =>
    span.end > line.start && span.start < line.end
      ? [
          {
            index,
            span: {
              ...span,
              start: Math.max(span.start, line.start) - line.start,
              end: Math.min(span.end, line.end) - line.start,
            },
          },
        ]
      : [],
  );
  return {
    card: line.card,
    /** Where the line starts in the card's text. */
    start: line.start,
    text: cue.text.slice(line.start, line.end),
    spans: spans && shown.map((each) => each.span),
    index: shown.map((each) => each.index),
  };
}

function Subtitle(props: {
  app: VideoApp;
  state: VideoState;
  variant: "inVideo" | "belowVideo" | "fullscreen" | "vertical";
}) {
  const { app, state } = props;
  const line = playingLine(state);
  const { panel, settings } = state;
  const ref = (span: number) => ({
    cue: line?.card ?? -1,
    span: line?.index[span] ?? -1,
  });
  const selected =
    line && panel?.ref.cue === line.card
      ? line.index.indexOf(panel.ref.span)
      : -1;
  return (
    <SubtitleOverlay
      variant={props.variant}
      // Below the video the box stays between lines, so the page does not jump.
      text={line?.text ?? " "}
      spans={line ? line.spans : []}
      highlight={settings.highlight}
      translation={line ? state.subtitleTranslation : ""}
      showTranslation={settings.subtitleTranslation}
      size={settings.subtitleSize}
      opacity={settings.subtitleOpacity}
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      selected={selected >= 0 ? selected : null}
      onWordEnter={(span, element) =>
        app.enterWord(ref(span), boxOf(element), "subtitle")
      }
      onWordLeave={app.leaveWord}
      onWordClick={(span) => app.clickWord(ref(span))}
      onSelectStart={() => app.selectStart("subtitle")}
      onSelect={(selected) =>
        selectIn(
          app,
          line?.card ?? -1,
          line?.start ?? 0,
          "subtitle",
          line && selected,
        )
      }
    />
  );
}

/**
 * Words selected in a text that shows a cue from `offset` on (the playing line, or a
 * whole card): offsets in the cue's text, and back for the words they snap to.
 */
function selectIn(
  app: VideoApp,
  cue: number,
  offset: number,
  place: WordPlace,
  selected: SelectedText | undefined,
): SelectedOffsets | undefined {
  const words = app.selectWords(
    selected && {
      cue,
      start: selected.from + offset,
      end: selected.to + offset,
      place,
    },
    (start, end) => selected?.boxOf(start - offset, end - offset),
  );
  return words && { from: words.start - offset, to: words.end - offset };
}

/** One video part's content under the theme setting. */
export function VideoThemed(props: {
  app: VideoApp;
  children: ComponentChildren;
}) {
  const { settings } = useStore(props.app.store);
  return <ThemeScope theme={settings.theme}>{props.children}</ThemeScope>;
}

/**
 * Inside the player: the subtitle over the video. In fullscreen the subtitle is always
 * over the video, larger (mock Fullscreen).
 */
export function InPlayerUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { subtitleBottom, vertical } = useStore(props.layout);
  const { settings, fullscreen } = state;
  const inVideo =
    showing(state) &&
    (fullscreen || vertical || settings.subtitlePosition === "inVideo") &&
    state.line >= 0;
  const inset = fullscreen
    ? FULLSCREEN_SUBTITLE_INSET
    : vertical
      ? VERTICAL_SUBTITLE_INSET
      : SUBTITLE_INSET;
  const bottom = fullscreen
    ? Math.max(FULLSCREEN_SUBTITLE_BOTTOM, subtitleBottom)
    : vertical
      ? VERTICAL_SUBTITLE_BOTTOM
      : subtitleBottom;
  return (
    <>
      {inVideo && (
        <div
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            // Netflix's control bar can lift it higher.
            bottom: `${bottom}px`,
            transition: "bottom 0.2s ease-out",
          }}
        >
          <Subtitle
            app={app}
            state={state}
            variant={
              fullscreen ? "fullscreen" : vertical ? "vertical" : "inVideo"
            }
          />
        </div>
      )}
    </>
  );
}

/**
 * The Lingo menu, above the L and ^ buttons. Over the page, in the top layer like the
 * dictionary window: inside the player, the site's own layers (Netflix's transcript
 * panel over the player) would cover it. Placed again while the page scrolls or resizes.
 */
export function MenuUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  // The site's control bar showing or hiding (the buttons go with it) moves the subtitle.
  const { vertical } = useStore(props.layout);
  const { settings, fullscreen } = state;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!state.menuOpen) return;
    const options = { capture: true, passive: true };
    addEventListener("scroll", rerender, options);
    addEventListener("resize", rerender, options);
    return () => {
      removeEventListener("scroll", rerender, options);
      removeEventListener("resize", rerender, options);
    };
  }, [state.menuOpen]);
  const player = geometry.player();
  const buttons = geometry.buttons();
  if (!state.menuOpen || !player || !buttons) return null;
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
  // Over a vertical video the buttons are at its top: the menu opens under them.
  const at = vertical
    ? menuBelowPlacement(player, buttons, viewport)
    : menuPlacement(player, buttons, viewport);
  return (
    <div
      style={{
        position: "fixed",
        zIndex: TOP_LAYER,
        right: `${at.right}px`,
        ...("top" in at
          ? { top: `${at.top}px` }
          : { bottom: `${at.bottom}px` }),
        pointerEvents: "auto",
      }}
    >
      <LingoMenu
        enabled={state.enabled}
        position={settings.subtitlePosition}
        showPositions={!fullscreen && !vertical}
        showTranslation={settings.subtitleTranslation}
        // No transcript over a Short.
        transcriptShown={vertical ? undefined : settings.transcriptShown}
        onToggleTranscript={() =>
          app.changeSettings({ transcriptShown: !settings.transcriptShown })
        }
        size={settings.subtitleSize}
        opacity={settings.subtitleOpacity}
        onPosition={(subtitlePosition) =>
          app.changeSettings({ subtitlePosition })
        }
        onPreview={({ size, opacity }) =>
          app.previewSettings({
            ...(size !== undefined && { subtitleSize: size }),
            ...(opacity !== undefined && { subtitleOpacity: opacity }),
          })
        }
        onSize={(subtitleSize) => app.changeSettings({ subtitleSize })}
        onOpacity={(subtitleOpacity) => app.changeSettings({ subtitleOpacity })}
        onToggleTranslation={() =>
          app.changeSettings({
            subtitleTranslation: !settings.subtitleTranslation,
          })
        }
        onOpenSettings={() => {
          app.setMenuOpen(false);
          app.openSettings();
        }}
        onClose={() => app.setMenuOpen(false)}
      />
    </div>
  );
}

/** Under the video: the large subtitle box (subtitle position "Below video"). */
export function BelowVideoUi({ app }: { app: VideoApp }) {
  const state = useStore(app.store);
  if (
    !showing(state) ||
    state.fullscreen ||
    state.settings.subtitlePosition !== "belowVideo"
  )
    return null;
  return (
    <div style={{ margin: "12px 0" }}>
      <Subtitle app={app} state={state} variant="belowVideo" />
    </div>
  );
}

/**
 * In the side column, or the sidebar beside a player that fills the window or the
 * screen: the Transcript and Words tabs, until the user closes them (in fullscreen only
 * in the sidebar).
 */
export function TranscriptUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { frameHeight, sidebar } = useStore(props.layout);
  const { cues, spans, summaries, settings, panel } = state;
  const words = useMemo(
    () => videoWords(cues, spans, summaries),
    [cues, spans, summaries],
  );
  if (
    !showing(state) ||
    !settings.transcriptShown ||
    (state.fullscreen && !sidebar)
  )
    return null;
  const fromTranscript = state.hover?.from === "transcript";
  const selectedInTranscript = state.phrase?.from === "transcript";
  return (
    <VideoPanel
      tab={state.panelTab}
      onTab={app.setPanelTab}
      cues={cues}
      spans={spans}
      translations={state.translations}
      showTranslation={settings.transcriptTranslation}
      onToggleTranslation={() =>
        app.changeSettings({
          transcriptTranslation: !settings.transcriptTranslation,
        })
      }
      highlight={settings.highlight}
      onToggleHighlight={app.toggleHighlight}
      current={state.card}
      onSeek={app.seekToCue}
      onWordEnter={(cue, span, element) =>
        app.enterWord({ cue, span }, boxOf(element), "transcript")
      }
      onWordLeave={app.leaveWord}
      onWordClick={(cue, span) => app.clickWord({ cue, span })}
      onSelectStart={() => app.selectStart("transcript")}
      onSelect={(cue, selected) =>
        selectIn(app, cue, 0, "transcript", selected)
      }
      // The list holds still while a word's card shows or words are selected.
      holdScroll={fromTranscript || state.selecting}
      onListScroll={() => {
        // The card would stay where the word was.
        if (fromTranscript) app.dismissHover();
        if (selectedInTranscript) app.clearSelection();
      }}
      words={filterRows(words, state.wordsFilter).map((word) => {
        const brief = Object.hasOwn(summaries, word.key)
          ? summaries[word.key]
          : undefined;
        return {
          id: `${word.kind}\n${word.key}`,
          head: word.head,
          category: word.category,
          count: word.count,
          short: brief?.short,
          shortLang: brief?.glossLang ?? settings.nativeLang,
          selected:
            panel?.card.kind === word.kind && panel.card.key === word.key,
          first: word.first,
        };
      })}
      wordsFilter={state.wordsFilter}
      wordsCounts={filterCounts(words)}
      onWordsFilter={app.setWordsFilter}
      onOpenWord={(row) => app.clickWord(row.first)}
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      height={Math.max(MIN_TRANSCRIPT_HEIGHT, Math.round(frameHeight))}
      dataNote={state.dataNote}
      onRetryData={app.retryPacks}
      onClose={() => app.changeSettings({ transcriptShown: false })}
    />
  );
}

/** In the player bar: the L and ^ buttons, while the video has subtitles to show. */
export function PlayerBarUi({ app }: { app: VideoApp }) {
  const state = useStore(app.store);
  if (state.status !== "ready" && state.status !== "loading") return null;
  return (
    <PlayerButtons
      enabled={state.enabled}
      menuOpen={state.menuOpen}
      onToggle={() => app.setEnabled(!state.enabled)}
      onMenu={() => app.setMenuOpen(!state.menuOpen)}
    />
  );
}

/**
 * While the dictionary window is open, a press anywhere else closes it: on the video,
 * the page or Lingo's other controls. Presses on the window, the hover card and words
 * are marked by them (`keepOpen`): a word's click opens it in the same window. Escape
 * closes it wherever the focus is: after a click on a word it stays in the subtitle or
 * the transcript, whose shadow host keeps keys from the page (read here, capturing).
 */
function useClosedByPressAway(app: VideoApp, open: boolean) {
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPress = (event: PointerEvent) => {
      if (!fromUser(event)) return;
      // Decided once the press has reached every part, which mark theirs.
      timer = setTimeout(() => {
        if (!keptOpen(event)) app.closePanel();
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (fromUser(event) && event.key === "Escape") app.closePanel();
    };
    addEventListener("pointerdown", onPress, true);
    addEventListener("keydown", onKeyDown, true);
    return () => {
      removeEventListener("pointerdown", onPress, true);
      removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timer);
    };
  }, [open]);
}

/**
 * While words are selected, Escape or a press anywhere else drops the selection and its
 * card. Presses on Lingo's cards and windows (`keepOpen`) keep it, and a press on a
 * text words are selected in makes a new selection.
 */
function useSelectionDroppedByPressAway(app: VideoApp, selecting: boolean) {
  useEffect(() => {
    if (!selecting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPress = (event: PointerEvent) => {
      if (!fromUser(event)) return;
      // Decided once the press has reached every part, which mark theirs.
      timer = setTimeout(() => {
        if (!keptOpen(event) && !pressedOnText(event)) app.clearSelection();
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (fromUser(event) && event.key === "Escape") app.clearSelection();
    };
    addEventListener("pointerdown", onPress, true);
    addEventListener("keydown", onKeyDown, true);
    return () => {
      removeEventListener("pointerdown", onPress, true);
      removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timer);
    };
  }, [selecting]);
}

/**
 * Over the page: the hover card, the selection's card and the dictionary window (in
 * fullscreen too: the host is then inside the fullscreen element).
 */
export function PageUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { vertical, sidebar } = useStore(props.layout);
  const { hover, panel, phrase, settings, fullscreen } = state;
  const position = sidebar
    ? "sidebar"
    : fullscreen
      ? "fullscreen"
      : settings.subtitlePosition;
  // Placed when the window opens or the screen changes; it stays where the user drags it.
  const frame = useMemo(() => {
    const player = geometry.player();
    const viewport = { width: innerWidth, height: innerHeight };
    if (!player) return { left: viewport.width - 376, top: 64, height: 400 };
    return vertical && !fullscreen
      ? verticalDictionaryFrame(player, geometry.beside(), viewport)
      : dictionaryFrame(player, position, viewport, geometry.transcript());
  }, [panel?.opened, fullscreen, sidebar]);
  useClosedByPressAway(app, !!panel);
  useSelectionDroppedByPressAway(app, state.selecting);
  if (!showing(state)) return null;

  return (
    <>
      {panel && (
        <DictionaryWindow
          key={`${panel.opened} ${fullscreen} ${sidebar}`}
          variant="window"
          frame={frame}
          // Over a video that fills the window or the screen: the darker shadow.
          fullscreen={fullscreen || sidebar}
          entry={windowView(panel.card)}
          nativeLang={settings.nativeLang}
          learningLang={settings.learningLang}
          status={panel.card.status}
          onStatus={app.setPanelStatus}
          onSpeak={app.speak}
          dictionaries={panel.dictionaries}
          here={{
            source: "video",
            items: panel.here.map((line) => ({
              time: formatTime(line.timeMs),
              text: line.text,
              marks: line.marks,
              onClick: () => app.seekTo(line.timeMs),
            })),
          }}
          elsewhere={elsewhereItems(panel.card.elsewhere, Date.now())}
          onClose={app.closePanel}
        />
      )}
      {hover && (
        <Floating
          anchor={hover.anchor}
          shift={8}
          onPointerEnter={app.keepHover}
          onPointerLeave={app.releaseHover}
        >
          <HoverCard
            variant="video"
            {...hoverView(hover.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.setHoverStatus("learning")}
            onKnown={() => app.setHoverStatus("known")}
          />
        </Floating>
      )}
      {phrase && (
        // Pressing the card's buttons must not clear the selection.
        <Floating anchor={phrase.anchor} shift={8} onMouseDown={keepSelection}>
          <HoverCard
            variant="video"
            selection
            {...hoverView(phrase.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.saveSelection("learning")}
            onKnown={() => app.saveSelection("known")}
            onDetails={app.openSelectionDetails}
          />
        </Floating>
      )}
    </>
  );
}

const keepSelection = (event: MouseEvent) => event.preventDefault();
