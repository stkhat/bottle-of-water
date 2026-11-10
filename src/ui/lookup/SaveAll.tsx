import { useState } from "preact/hooks";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { color, root, sectionHeading } from "./styles";

export interface SaveAllProps {
  /** What is being saved: the popup says "This page"; the end cards "This video" / "This article". */
  scope: "page" | "article" | "video";
  /** Words on the page or video that are not saved yet. */
  unsavedCount: number;
  /** The last save-all, until it is undone or forgotten. */
  done: { count: number; target: "learning" | "known" } | null;
  /** The end card's explanation also says the card can be turned off. */
  cardNote: boolean;
  onAddLearning: () => void;
  onMarkKnown: () => void;
  onUndo: () => void;
}

const SCOPE = {
  page: "saveAll.scope.page",
  article: "saveAll.scope.article",
  video: "saveAll.scope.video",
} as const;

function unsavedLine(count: number): string {
  if (count === 0) return t("saveAll.allSaved");
  return count === 1
    ? t("saveAll.unsaved.one")
    : t("saveAll.unsaved", { count });
}

function doneLine(done: NonNullable<SaveAllProps["done"]>): string {
  const one = done.count === 1;
  if (done.target === "learning")
    return one
      ? t("saveAll.done.learning.one")
      : t("saveAll.done.learning", { count: done.count });
  return one
    ? t("saveAll.done.known.one")
    : t("saveAll.done.known", { count: done.count });
}

/** Save every unsaved word at once (mock Toolbar "This page" and the end cards). */
export function SaveAll(props: SaveAllProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const note = props.cardNote
    ? `${t("saveAll.note")} ${t("saveAll.cardNote")}`
    : t("saveAll.note");

  return (
    <div
      style={root({ display: "flex", flexDirection: "column", gap: "10px" })}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={sectionHeading}>{t(SCOPE[props.scope])}</span>
          <button
            type="button"
            aria-label={t("saveAll.about")}
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((open) => !open)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              border: 0,
              borderRadius: "16px",
              padding: 0,
              cursor: "pointer",
              ...(infoOpen
                ? { background: color.greenPale, color: color.greenDark }
                : { background: "transparent", color: color.muted }),
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 11v5"></path>
              <path d="M12 7.5v.5"></path>
            </svg>
          </button>
        </span>
        <span style={{ fontSize: "13px", color: color.ink3 }}>
          {unsavedLine(props.unsavedCount)}
        </span>
      </div>
      {props.unsavedCount > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={onlyFromUser(() => props.onAddLearning())}
            style={{
              height: "40px",
              borderRadius: "8px",
              border: `1px solid ${color.greenLine}`,
              background: color.white,
              color: color.greenDark,
              font: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("saveAll.addLearning")}
          </button>
          <button
            type="button"
            onClick={onlyFromUser(() => props.onMarkKnown())}
            style={{
              height: "40px",
              borderRadius: "8px",
              border: `1px solid ${color.ink}`,
              background: color.ink,
              color: color.white,
              font: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("saveAll.markKnown")}
          </button>
        </div>
      )}
      {props.done && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            fontSize: "13px",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={color.green}
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5 9-10"></path>
            </svg>
            {doneLine(props.done)}
          </span>
          <button
            type="button"
            onClick={onlyFromUser(() => props.onUndo())}
            style={{
              height: "32px",
              padding: "0 10px",
              borderRadius: "6px",
              border: 0,
              background: "transparent",
              color: color.greenText,
              font: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("saveAll.undo")}
          </button>
        </div>
      )}
      {infoOpen && (
        <p
          role="note"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: "8px",
            background: color.surface,
            fontSize: "12px",
            lineHeight: 1.5,
            color: color.ink3,
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
