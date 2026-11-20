import type { CSSProperties } from "preact";
import { cardHref, type SponsorCard } from "../../core/sponsors";
import { languageName } from "../../i18n/languages";
import { t } from "../../i18n/t";
import { color } from "../../ui/styles";

const label: CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: color.muted,
  fontWeight: 600,
};

const pageLink: CSSProperties = { color: color.greenText };

/** The card's logo, name and line, one link (opened only when clicked). */
function CardLink(props: { card: SponsorCard }) {
  const { card } = props;
  return (
    <a
      href={cardHref(card)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        color: color.ink,
        textDecoration: "none",
      }}
    >
      {card.logo && (
        <img
          src={`/${card.logo}`}
          width={40}
          height={40}
          alt=""
          style={{
            flex: "none",
            display: "block",
            borderRadius: "8px",
            objectFit: "contain",
          }}
        />
      )}
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 600 }}>{card.name}</span>
        <span style={{ fontSize: "13px", lineHeight: 1.4, color: color.muted }}>
          {card.line}
        </span>
      </span>
    </a>
  );
}

/**
 * The spot pinned under the word's details (mock WordList, `sponsor`): a sponsor
 * ("Sponsored"), an affiliate link ("Ad" and the commission line), or, with neither
 * bundled, an invitation to sponsor it. The invitation needs the sponsor page; without
 * it the spot is left out.
 */
export function SponsorSpot(props: {
  card: SponsorCard | null;
  /** The page for would-be sponsors; empty while it does not exist. */
  sponsorPage: string;
  learningLang: string;
}) {
  const { card, sponsorPage } = props;
  if (!card && !sponsorPage) return null;
  return (
    <div
      data-sponsor-spot
      style={{
        flex: "none",
        borderTop: `1px solid ${color.soft}`,
        padding: "12px 20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {card?.type === "sponsor" && (
        <>
          <span style={label}>{t("sponsor.sponsored")}</span>
          <CardLink card={card} />
        </>
      )}
      {card?.type === "affiliate" && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span style={label}>{t("sponsor.ad")}</span>
            {sponsorPage && (
              <a
                href={sponsorPage}
                target="_blank"
                rel="noopener"
                style={{ ...pageLink, fontSize: "12px" }}
              >
                {t("support.becomeSponsor")}
              </a>
            )}
          </div>
          <CardLink card={card} />
          <span style={{ fontSize: "12px", color: color.muted }}>
            {t("sponsor.commission")}
          </span>
        </>
      )}
      {!card && (
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            lineHeight: 1.5,
            color: color.muted,
          }}
        >
          {t("sponsor.open", { language: languageName(props.learningLang) })}{" "}
          <a href={sponsorPage} target="_blank" rel="noopener" style={pageLink}>
            {t("sponsor.openLink")}
          </a>
        </p>
      )}
    </div>
  );
}
