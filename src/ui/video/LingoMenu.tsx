import { useEffect, useRef } from "preact/hooks";
import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";
import { badge, color, root } from "../lookup/styles";
import { Switch } from "../lookup/Switch";

export interface LingoMenuProps {
  /** Lingo is on for this video. */
  enabled: boolean;
  position: Settings["subtitlePosition"];
  /** The subtitle position group; not in fullscreen (mock Fullscreen). Default: shown. */
  showPositions?: boolean;
  /** The subtitle translation switch. */
  showTranslation: boolean;
  onPosition: (position: Settings["subtitlePosition"]) => void;
  onToggleTranslation: () => void;
  onOpenSettings: () => void;
  /** Escape, or a press outside the menu and its buttons. */
  onClose: () => void;
}

const POSITIONS = [
  ["inVideo", "video.menu.inVideo"],
  ["belowVideo", "video.menu.belowVideo"],
] as const;

/** Elements marked `data-lingo-menu` (the menu and its buttons) are inside. */
const inMenu = (event: Event) =>
  event
    .composedPath()
    .some((n) => n instanceof HTMLElement && n.dataset.lingoMenu !== undefined);

/** The menu above the ^ button (mock Main). The caller positions it. */
export function LingoMenu(props: LingoMenuProps) {
  const close = useRef(props.onClose);
  close.current = props.onClose;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!inMenu(event)) close.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-label={t("video.menu")}
      data-lingo-menu
      style={root({
        width: "300px",
        padding: "14px 16px",
        background: color.white,
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
      </div>
      {props.showPositions !== false && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span
            style={{
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
            aria-label={t("video.menu.position")}
            style={{
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
                    padding: "0 12px",
                    margin: 0,
                    borderRadius: "8px",
                    border: 0,
                    font: "inherit",
                    fontSize: "13px",
                    cursor: "pointer",
                    ...(pressed
                      ? {
                          background: color.white,
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
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ flex: 1, fontSize: "14px" }}>
          {t("video.menu.showTranslation")}
        </span>
        <Switch
          checked={props.showTranslation}
          label={t("video.menu.translationSwitch")}
          onToggle={props.onToggleTranslation}
        />
      </div>
      <button
        type="button"
        onClick={props.onOpenSettings}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          // The mock's link is 40px plus its border.
          height: "42px",
          margin: 0,
          borderRadius: "8px",
          border: `1px solid ${color.lineStrong}`,
          background: color.white,
          color: color.ink,
          font: "inherit",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path>
        </svg>
        {t("video.menu.openSettings")}
      </button>
    </div>
  );
}
