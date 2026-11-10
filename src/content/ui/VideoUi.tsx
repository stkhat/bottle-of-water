import { useMemo } from "preact/hooks";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { elsewhereItems, formatTime } from "../../ui/lookup/elsewhere";
import { EndCard } from "../../ui/lookup/EndCard";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { LingoMenu } from "../../ui/video/LingoMenu";
import { PlayerButtons } from "../../ui/video/PlayerButtons";
import { SubtitleOverlay } from "../../ui/video/SubtitleOverlay";
import { Transcript } from "../../ui/video/Transcript";
import { shownStatus } from "../article/describe";
import type { Box } from "../article/geometry";
import { dictionaryFrame, menuPlacement } from "../video/placement";
import type { VideoApp, VideoState } from "../video/session";
import { Floating } from "./Floating";
import { useStore, type Store } from "./store";

const TOP_LAYER = 2147483647;

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
/** The gap kept between the in-video subtitle and the site's control bar (px). */
export const CONTROL_BAR_GAP = 12;

/** The transcript is never shorter than this (px). */
const MIN_TRANSCRIPT_HEIGHT = 320;
/** Mock Main: the "Video finished" card under the site's header, 16px from the right. */
const END_CARD = { top: 68, right: 16 };

/** Lingo shows its subtitles and transcript for this video. */
const showing = (state: VideoState) =>
  state.enabled && state.status === "ready";

const boxOf = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

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
  variant: "inVideo" | "belowVideo";
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
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      selected={selected >= 0 ? selected : null}
      onWordEnter={(span, element) => app.enterWord(ref(span), boxOf(element))}
      onWordLeave={app.leaveWord}
      onWordClick={(span) => app.clickWord(ref(span))}
    />
  );
}

/** Inside the player: the subtitle over the video and the Lingo menu. */
export function InPlayerUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { subtitleBottom } = useStore(props.layout);
  const { settings } = state;
  const inVideo =
    showing(state) &&
    !state.fullscreen &&
    settings.subtitlePosition === "inVideo" &&
    state.line >= 0;
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
            // Mock Main: 120px in from each side of the 880px video, less on small players.
            left: "clamp(12px, calc((100% - 640px) / 2), 120px)",
            right: "clamp(12px, calc((100% - 640px) / 2), 120px)",
            bottom: `${subtitleBottom}px`,
            transition: "bottom 0.2s ease-out",
          }}
        >
          <Subtitle app={app} state={state} variant="inVideo" />
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
            showTranslation={settings.subtitleTranslation}
            onPosition={(subtitlePosition) =>
              app.changeSettings({ subtitlePosition })
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

/** In the side column: the transcript. */
export function TranscriptUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { frameHeight } = useStore(props.layout);
  if (!showing(state)) return null;
  const { settings } = state;
  return (
    <Transcript
      cues={state.cues}
      spans={state.spans}
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
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      height={Math.max(MIN_TRANSCRIPT_HEIGHT, Math.round(frameHeight))}
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

/** Over the page: the hover card, the dictionary window and the end card. */
export function PageUi(props: { app: VideoApp; geometry: VideoGeometry }) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { hover, panel, settings } = state;
  const position = settings.subtitlePosition;
  // Placed when the window opens; it stays where the user drags it.
  const frame = useMemo(() => {
    const player = geometry.player();
    const viewport = { width: innerWidth, height: innerHeight };
    return player
      ? dictionaryFrame(player, position, viewport, geometry.transcript())
      : { left: viewport.width - 376, top: 64, height: 400 };
  }, [panel?.opened]);
  if (!showing(state) || state.fullscreen) return null;

  return (
    <>
      {panel && (
        <DictionaryWindow
          key={panel.opened}
          variant="window"
          frame={frame}
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
          status={panel.card.status}
          onStatus={app.setPanelStatus}
          onSpeak={app.speak}
          dictionaries={panel.dictionaries}
          here={{
            source: "video",
            items: panel.here.map((line) => ({
              time: formatTime(line.timeMs),
              text: line.text,
              onClick: () => app.seekTo(line.timeMs),
            })),
          }}
          elsewhere={elsewhereItems(panel.card.elsewhere, Date.now())}
          onClose={app.closePanel}
        />
      )}
      {state.endCard && (
        <div
          style={{
            position: "fixed",
            zIndex: TOP_LAYER,
            top: `${END_CARD.top}px`,
            right: `${END_CARD.right}px`,
          }}
        >
          <EndCard
            kind="video"
            saveAll={{
              unsavedCount: state.unsaved,
              done: state.done,
              onAddLearning: () => app.saveAll("learning"),
              onMarkKnown: () => app.saveAll("known"),
              onUndo: app.undoSaveAll,
            }}
            onClose={app.closeEndCard}
          />
        </div>
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
          />
        </Floating>
      )}
    </>
  );
}
