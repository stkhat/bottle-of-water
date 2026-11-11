import { useId, useLayoutEffect, useRef } from "preact/hooks";
import {
  SUBTITLE_OPACITY_MAX,
  SUBTITLE_OPACITY_MIN,
  SUBTITLE_OPACITY_STEP,
  SUBTITLE_SIZE_MAX,
  SUBTITLE_SIZE_MIN,
  SUBTITLE_SIZE_STEP,
  type Settings,
} from "../../core/settings";
import { t } from "../../i18n/t";
import { fromUser } from "../from-user";
import { badge, color, root } from "../lookup/styles";
import { Switch } from "../lookup/Switch";
import { GearIcon } from "../icons";

export interface LingoMenuProps {
  /** Lingo is on for this video. */
  enabled: boolean;
  position: Settings["subtitlePosition"];
  /** The subtitle position group; not in fullscreen (mock Fullscreen). Default: shown. */
  showPositions?: boolean;
  /** The subtitle translation switch. */
  showTranslation: boolean;
  /** `Settings.subtitleSize`, or the value being dragged. */
  size: number;
  /** `Settings.subtitleOpacity`, or the value being dragged. */
  opacity: number;
  onPosition: (position: Settings["subtitlePosition"]) => void;
  onToggleTranslation: () => void;
  /** While a slider is dragged: show the value, do not save it yet. */
  onPreview: (look: { size?: number; opacity?: number }) => void;
  /** A slider was let go: save the value. */
  onSize: (size: number) => void;
  onOpacity: (opacity: number) => void;
  onOpenSettings: () => void;
  /** Escape, or a press outside the menu and its buttons. */
  onClose: () => void;
}

const POSITIONS = [
  ["inVideo", "video.menu.inVideo"],
  ["belowVideo", "video.menu.belowVideo"],
] as const;

/** A labelled slider row: label on the left, the range on the right. */
function MenuSlider(props: {
  label: string;
  value: number;
  range: readonly [min: number, max: number, step: number];
  onInput: (value: number) => void;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [min, max, step] = props.range;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <label for={id} style={{ flex: "none", width: "84px", fontSize: "14px" }}>
        {props.label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.value}
        aria-valuetext={`${props.value}%`}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          accentColor: color.green,
          cursor: "pointer",
        }}
      />
    </div>
  );
}

/** Elements marked `data-lingo-menu` (the menu and its buttons) are inside. */
const isMenuElement = (n: EventTarget) =>
  n instanceof HTMLElement && n.dataset.lingoMenu !== undefined;

/** A host of Lingo's UI (`lingo-*`). */
const isLingoHost = (n: EventTarget) =>
  n instanceof Element && n.localName.startsWith("lingo-");

/** Presses that reached the menu or one of its buttons (`keepMenuOpen`). */
const pressesInside = new WeakSet<Event>();

/**
 * The `onPointerDown` of the menu and its buttons (with `data-lingo-menu`). In a closed
 * shadow root (production builds) a listener on the document sees only the root's host,
 * so they say themselves that a press is inside.
 */
export function keepMenuOpen(event: Event) {
  pressesInside.add(event);
}

/** The menu above the ^ button (mock Main). The caller positions it. */
export function LingoMenu(props: LingoMenuProps) {
  const close = useRef(props.onClose);
  close.current = props.onClose;

  // Listening from the render that opens it, not after a paint: an Escape or a press
  // right after opening still closes it.
  useLayoutEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // A page script's events do not close it (`fromUser`).
    const onPointerDown = (event: PointerEvent) => {
      if (!fromUser(event)) return;
      const path = event.composedPath();
      if (path.some(isMenuElement)) return;
      if (!path.some(isLingoHost)) {
        close.current();
        return;
      }
      // In Lingo's UI behind a closed shadow root: known once the press reached it.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!pressesInside.has(event)) close.current();
      });
      timers.add(timer);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (fromUser(event) && event.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-label={t("video.menu")}
      data-lingo-menu
      onPointerDown={keepMenuOpen}
      style={root({
        width: "300px",
        padding: "14px 16px",
        background: color.card,
        borderRadius: "12px",
        boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      })}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={badge(24, 7, 12)}>L</span>
        <span style={{ flex: 1, fontSize: "14px", fontWeight: 700 }}>
          {t("app.name")}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {t(props.enabled ? "video.menu.on" : "video.menu.off")}
        </span>
        <button
          type="button"
          aria-label={t("action.openSettings")}
          title={t("action.openSettings")}
          onClick={props.onOpenSettings}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            width: "32px",
            height: "32px",
            // The 32px button sits in the 24px row without making it taller.
            margin: "-4px -6px -4px 0",
            padding: 0,
            borderRadius: "8px",
            border: 0,
            background: "none",
            color: color.ink3,
            cursor: "pointer",
          }}
        >
          <GearIcon size={18} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ flex: 1, fontSize: "14px" }}>
          {t("video.menu.showTranslation")}
        </span>
        <Switch
          checked={props.showTranslation}
          label={t("subtitle.translation")}
          onToggle={props.onToggleTranslation}
        />
      </div>
      <MenuSlider
        label={t("video.menu.size")}
        value={props.size}
        range={[SUBTITLE_SIZE_MIN, SUBTITLE_SIZE_MAX, SUBTITLE_SIZE_STEP]}
        onInput={(size) => props.onPreview({ size })}
        onChange={props.onSize}
      />
      <MenuSlider
        label={t("video.menu.opacity")}
        value={props.opacity}
        range={[
          SUBTITLE_OPACITY_MIN,
          SUBTITLE_OPACITY_MAX,
          SUBTITLE_OPACITY_STEP,
        ]}
        onInput={(opacity) => props.onPreview({ opacity })}
        onChange={props.onOpacity}
      />
      {props.showPositions !== false && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              flex: "none",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: color.muted,
              fontWeight: 600,
            }}
          >
            {t("video.menu.subtitles")}
          </span>
          <div
            role="group"
            aria-label={t("subtitle.position")}
            style={{
              flex: 1,
              minWidth: 0,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "2px",
              padding: "3px",
              borderRadius: "10px",
              background: color.surfaceGray,
            }}
          >
            {POSITIONS.map(([value, label]) => {
              const pressed = props.position === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => props.onPosition(value)}
                  style={{
                    height: "32px",
                    padding: "0 6px",
                    margin: 0,
                    borderRadius: "8px",
                    border: 0,
                    font: "inherit",
                    fontSize: "13px",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    ...(pressed
                      ? {
                          background: color.raised,
                          color: color.ink,
                          fontWeight: 600,
                          boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
                        }
                      : { background: "transparent", color: color.ink3 }),
                  }}
                >
                  {t(label)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
