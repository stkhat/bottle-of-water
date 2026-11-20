import type { ComponentChildren, CSSProperties } from "preact";
import type { SupportLinks } from "../../../core/links";
import { t } from "../../../i18n/t";
import { CupIcon, HeartIcon, MessageIcon, StarIcon } from "../../../ui/icons";
import { color } from "../../../ui/styles";

const button: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  height: "40px",
  boxSizing: "border-box",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};

const primary: CSSProperties = {
  ...button,
  color: color.white,
  background: color.greenFill,
  border: 0,
};

const secondary: CSSProperties = {
  ...button,
  color: color.greenDark,
  background: color.card,
  border: `1px solid ${color.greenLine}`,
};

/** A link that opens in a new tab; none while its page does not exist (empty URL). */
function Out(props: {
  href: string;
  style: CSSProperties;
  children: ComponentChildren;
}) {
  if (!props.href) return null;
  return (
    <a href={props.href} target="_blank" rel="noopener" style={props.style}>
      {props.children}
    </a>
  );
}

/**
 * The Support Langle box under the section nav (mock Settings `#support`): Ko-fi, the
 * store's review page, the feedback form and the sponsor page. None of them set: no box.
 */
export function SupportBox(props: { links: SupportLinks }) {
  const { links } = props;
  if (!links.coffee && !links.review && !links.feedback && !links.sponsor)
    return null;
  return (
    <section
      id="support"
      aria-labelledby="support-h"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "18px 16px",
        borderRadius: "14px",
        background: color.greenPale,
        border: `1px solid ${color.greenEdge}`,
      }}
    >
      <h2
        id="support-h"
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "16px",
          fontWeight: 700,
          color: color.greenDark,
        }}
      >
        <HeartIcon size={18} />
        {t("support.title")}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          lineHeight: 1.5,
          color: color.ink2,
        }}
      >
        {t("support.lead")}
      </p>
      <Out href={links.coffee} style={primary}>
        <CupIcon size={16} />
        {t("support.coffee")}
      </Out>
      <Out href={links.review} style={secondary}>
        <StarIcon size={16} />
        {t("support.rateLangle")}
      </Out>
      <Out href={links.feedback} style={secondary}>
        <MessageIcon size={16} />
        {t("support.feedback")}
      </Out>
      <Out
        href={links.sponsor}
        style={{
          alignSelf: "center",
          fontSize: "12px",
          fontWeight: 600,
          color: color.greenDark,
        }}
      >
        {t("support.becomeSponsor")}
      </Out>
    </section>
  );
}
