import { t } from "../../i18n/t";
import { ChevronUpIcon } from "../icons";
import { color, root } from "../styles";
import { keepMenuOpen } from "./LingoMenu";

export interface PlayerButtonsProps {
  enabled: boolean;
  menuOpen: boolean;
  /** The L button. */
  onToggle: () => void;
  /** The ^ button. */
  onMenu: () => void;
}

/**
 * Mock Main's group in the player bar: the L toggle and the ^ menu button in one green
 * outline, so they are not taken for the site's own buttons. Both carry
 * `data-lingo-menu` and `keepMenuOpen`: pressing them is not a click outside the menu.
 */
export function PlayerButtons(props: PlayerButtonsProps) {
  const on = props.enabled;
  return (
    <span
      role="group"
      aria-label={t("app.name")}
      style={root({
        display: "inline-flex",
        alignItems: "center",
        margin: "0 6px",
        padding: "2px",
        borderRadius: "10px",
        border: "1.5px solid #3FC79F",
        background: "rgba(11,138,108,0.22)",
        verticalAlign: "middle",
      })}
    >
      <button
        type="button"
        data-lingo-menu
        onPointerDown={keepMenuOpen}
        aria-label={t("video.toggle")}
        aria-pressed={on}
        title={t(on ? "video.toggle.on" : "video.toggle.off")}
        onClick={props.onToggle}
        style={{
          boxSizing: "border-box",
          width: "36px",
          height: "36px",
          margin: 0,
          padding: 0,
          borderRadius: "8px",
          font: "inherit",
          fontWeight: 700,
          fontSize: "15px",
          cursor: "pointer",
          ...(on
            ? { background: color.green, color: color.white, border: 0 }
            : {
                background: "transparent",
                color: "#E4E6EB",
                border: "1.5px dashed rgba(255,255,255,0.55)",
                textDecoration: "line-through",
              }),
        }}
      >
        L
      </button>
      <span
        aria-hidden="true"
        style={{
          width: "1px",
          height: "20px",
          margin: "0 2px",
          background: "rgba(255,255,255,0.35)",
        }}
      ></span>
      <button
        type="button"
        data-lingo-menu
        onPointerDown={keepMenuOpen}
        aria-label={t("video.menu")}
        aria-expanded={props.menuOpen}
        onClick={props.onMenu}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "28px",
          height: "36px",
          margin: 0,
          padding: 0,
          borderRadius: "8px",
          border: 0,
          cursor: "pointer",
          color: color.white,
          background: props.menuOpen ? "rgba(255,255,255,0.22)" : "transparent",
        }}
      >
        <ChevronUpIcon />
      </button>
    </span>
  );
}
