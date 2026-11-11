import type { ComponentChildren } from "preact";
import { useEffect, useMemo } from "preact/hooks";
import { fromUser } from "../../ui/from-user";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { keptOpen } from "../../ui/lookup/keep-open";
import { elsewhereItems, formatTime } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { LingoMenu } from "../../ui/video/LingoMenu";
import { PlayerButtons } from "../../ui/video/PlayerButtons";
import { SubtitleOverlay } from "../../ui/video/SubtitleOverlay";
import { VideoPanel } from "../../ui/video/VideoPanel";
import { ThemeScope } from "../../ui/ThemeScope";
import { hoverView, windowView } from "../lookup/describe";
import { boxOf, type Box } from "../lookup/geometry";
import { dictionaryFrame, menuPlacement } from "./placement";
import type { VideoApp, VideoState } from "./state";
import { filterCounts, filterRows, videoWords } from "./words";
import { Floating } from "../lookup/Floating";
import { useStore, type Store } from "../store";

/** Where the parts of the page are, read when needed. */
export interface VideoGeometry {
  player(): Box | null;
  /** The L and ^ buttons. */
  buttons(): Box | null;
  /** Lingo's transcript, while it shows. */
  transcript(): Box | null;
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
}

/** Mock Main: the in-video subtitle sits 64px above the player's bottom. */
export const SUBTITLE_BOTTOM = 64;
/** Mock Fullscreen: the subtitle sits 120px above the screen's bottom. */
const FULLSCREEN_SUBTITLE_BOTTOM = 120;
/** Mock Fullscreen: 200px in from each side of the 1440px screen, less on small ones. */
const FULLSCREEN_SUBTITLE_INSET = "clamp(24px, 14%, 200px)";
/** Mock Main: 120px in from each side of the 880px video, less on small players. */
const SUBTITLE_INSET = "clamp(12px, calc((100% - 640px) / 2), 120px)";
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
    text: cue.text.slice(line.start, line.end),
    spans: spans && shown.map((each) => each.span),
    index: shown.map((each) => each.index),
  };
}

function Subtitle(props: {
  app: VideoApp;
  state: VideoState;
  variant: "inVideo" | "belowVideo" | "fullscreen";
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
    />
  );
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
 * Inside the player: the subtitle over the video and the Lingo menu. In fullscreen the
 * subtitle is always over the video, larger (mock Fullscreen).
 */
export function InPlayerUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { subtitleBottom } = useStore(props.layout);
  const { settings, fullscreen } = state;
  const inVideo =
    showing(state) &&
    (fullscreen || settings.subtitlePosition === "inVideo") &&
    state.line >= 0;
  const inset = fullscreen ? FULLSCREEN_SUBTITLE_INSET : SUBTITLE_INSET;
  const player = geometry.player();
  const buttons = geometry.buttons();
  const menu =
    state.menuOpen && player && buttons ? menuPlacement(player, buttons) : null;
  return (
    <>
      {inVideo && (
        <div
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            // Netflix's control bar can lift it higher.
            bottom: `${fullscreen ? Math.max(FULLSCREEN_SUBTITLE_BOTTOM, subtitleBottom) : subtitleBottom}px`,
            transition: "bottom 0.2s ease-out",
          }}
        >
          <Subtitle
            app={app}
            state={state}
            variant={fullscreen ? "fullscreen" : "inVideo"}
          />
        </div>
      )}
      {menu && (
        <div
          style={{
            position: "absolute",
            right: `${menu.right}px`,
            bottom: `${menu.bottom}px`,
            pointerEvents: "auto",
          }}
        >
          <LingoMenu
            enabled={state.enabled}
            position={settings.subtitlePosition}
            showPositions={!fullscreen}
            showTranslation={settings.subtitleTranslation}
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
            onOpacity={(subtitleOpacity) =>
              app.changeSettings({ subtitleOpacity })
            }
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
      )}
    </>
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

/** In the side column: the Transcript and Words tabs (not in fullscreen). */
export function TranscriptUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { frameHeight } = useStore(props.layout);
  const { cues, spans, summaries, settings, panel } = state;
  const words = useMemo(
    () => videoWords(cues, spans, summaries),
    [cues, spans, summaries],
  );
  if (!showing(state) || state.fullscreen) return null;
  const idOf = (row: { key: string; kind: string }) =>
    `${row.kind}\n${row.key}`;
  const open = panel && idOf(panel.card);
  const fromTranscript = state.hover?.from === "transcript";
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
      holdScroll={fromTranscript}
      onListScroll={() => {
        // The card would stay where the word was.
        if (fromTranscript) app.dismissHover();
      }}
      words={filterRows(words, state.wordsFilter).map((row) => {
        const brief = Object.hasOwn(summaries, row.key)
          ? summaries[row.key]
          : undefined;
        return {
          id: idOf(row),
          head: row.head,
          category: row.category,
          count: row.count,
          short: brief?.short,
          shortLang: brief?.glossLang ?? settings.nativeLang,
          selected: idOf(row) === open,
        };
      })}
      wordsFilter={state.wordsFilter}
      wordsCounts={filterCounts(words)}
      onWordsFilter={app.setWordsFilter}
      onOpenWord={(id) => {
        const row = words.find((each) => idOf(each) === id);
        if (row) app.clickWord(row.first);
      }}
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      height={Math.max(MIN_TRANSCRIPT_HEIGHT, Math.round(frameHeight))}
      dataNote={state.dataNote}
      onRetryData={app.retryPacks}
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
 * are marked by them (`keepOpen`): a word's click opens it in the same window.
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
    addEventListener("pointerdown", onPress, true);
    return () => {
      removeEventListener("pointerdown", onPress, true);
      clearTimeout(timer);
    };
  }, [open]);
}

/**
 * Over the page: the hover card and the dictionary window (in fullscreen too: the host
 * is then inside the fullscreen element).
 */
export function PageUi(props: { app: VideoApp; geometry: VideoGeometry }) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { hover, panel, settings, fullscreen } = state;
  const position = fullscreen ? "fullscreen" : settings.subtitlePosition;
  // Placed when the window opens or the screen changes; it stays where the user drags it.
  const frame = useMemo(() => {
    const player = geometry.player();
    const viewport = { width: innerWidth, height: innerHeight };
    return player
      ? dictionaryFrame(player, position, viewport, geometry.transcript())
      : { left: viewport.width - 376, top: 64, height: 400 };
  }, [panel?.opened, fullscreen]);
  useClosedByPressAway(app, !!panel);
  if (!showing(state)) return null;

  return (
    <>
      {panel && (
        <DictionaryWindow
          key={`${panel.opened} ${fullscreen}`}
          variant="window"
          frame={frame}
          fullscreen={fullscreen}
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
    </>
  );
}
