import type { CSSProperties, TargetedMouseEvent } from "preact";
import { t } from "../../i18n/t";
import { CloseIcon, CupIcon, StarIcon } from "../../ui/icons";
import { color, FONT } from "../../ui/styles";

/** Learning words at which the popup asks once for a rating. */
export const RATE_NUDGE_AT = 100;

/** The nudge alone is set in Nunito (bundled by `main.tsx`), the rest of the popup in Inter. */
const NUDGE_FONT = `'Nunito', ${FONT}`;

/**
 * The one-time rating nudge (mock Toolbar): a speech bubble over the footer whose tail
 * points down at Rate. × (or Rate itself) answers it for good.
 */
export function RateNudge(props: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: "relative",
        fontFamily: NUDGE_FONT,
        display: "flex",
        alignItems: "flex-start",
        gap: "4px",
        marginBottom: "-6px",
        padding: "10px 4px 10px 12px",
        borderRadius: "10px",
        background: color.blueTint,
        color: color.ink,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <span
          style={{ fontSize: "15px", fontWeight: 800, color: color.blueText }}
        >
          {t("support.nudge.title", { count: RATE_NUDGE_AT })}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: 1.45,
            color: color.ink2,
          }}
        >
          {t("support.nudge.line")}
        </span>
      </span>
      <button
        type="button"
        aria-label={t("support.nudge.dismiss")}
        title={t("support.nudge.dismiss")}
        onClick={props.onDismiss}
        style={{
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "32px",
          height: "32px",
          marginTop: "-4px",
          border: 0,
          borderRadius: "6px",
          background: "transparent",
          color: color.ink3,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <CloseIcon size={14} stroke={2} />
      </button>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "14px",
          bottom: "-6px",
          width: "12px",
          height: "12px",
          background: color.blueTint,
          transform: "rotate(45deg)",
        }}
      ></span>
    </div>
  );
}

const link: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: "32px",
  padding: "0 8px",
  borderRadius: "6px",
  fontSize: "12px",
  color: color.muted,
  textDecoration: "none",
};

/** "{coffee} if you enjoy Langle" with "Buy me a coffee" in bold. */
function CoffeeLine() {
  const [before = "", after = ""] = t("support.coffeeIfYouEnjoy").split(
    "{coffee}",
  );
  return (
    <span>
      {before}
      <span style={{ fontWeight: 600, color: color.ink3 }}>
        {t("support.coffee")}
      </span>
      {after}
    </span>
  );
}

/**
 * The popup's footer (mock Toolbar): Rate at the left, highlighted while the nudge
 * points at it, and "Buy me a coffee" at the right. A link without a URL is left out,
 * and the footer with them.
 */
export function SupportNav(props: {
  reviewUrl: string;
  coffeeUrl: string;
  /** The nudge points at Rate. */
  nudging: boolean;
  onRate: () => void;
  onOpen: (url: string) => void;
}) {
  if (!props.reviewUrl && !props.coffeeUrl) return null;
  const follow =
    (url: string, then?: () => void) =>
    (event: TargetedMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (then) then();
      else props.onOpen(url);
    };
  return (
    <nav
      aria-label={t("support.title")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 10px",
        borderTop: `1px solid ${color.soft}`,
      }}
    >
      {props.reviewUrl && (
        <a
          href={props.reviewUrl}
          onClick={follow(props.reviewUrl, props.onRate)}
          style={{
            ...link,
            ...(props.nudging && {
              color: color.blueText,
              fontWeight: 600,
              background: color.blueTint,
            }),
          }}
        >
          <StarIcon size={14} />
          {t("support.rate")}
        </a>
      )}
      <span style={{ flex: 1 }}></span>
      {props.coffeeUrl && (
        <a
          href={props.coffeeUrl}
          onClick={follow(props.coffeeUrl)}
          style={link}
        >
          <CupIcon size={14} />
          <CoffeeLine />
        </a>
      )}
    </nav>
  );
}
