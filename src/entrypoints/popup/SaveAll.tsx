import { useState } from "preact/hooks";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../../ui/from-user";
import { CheckIcon, InfoIcon, WordListIcon } from "../../ui/icons";
import { color, root, sectionHeading, statusButton } from "../../ui/styles";

export interface SaveAllProps {
  /** What is being saved: "This page" on an article, "This video" on a video site. */
  scope: "page" | "video";
  /** Words on the page or video that are not saved yet. */
  unsavedCount: number;
  /** The last save-all, until it is undone or forgotten. */
  done: { count: number; target: "learning" | "known" } | null;
  onAddLearning: () => void;
  onMarkKnown: () => void;
  onUndo: () => void;
  /** "Show words on this page" (articles only): opens the page's Words list. None without it. */
  onShowWords?: () => void;
}

const SCOPE = {
  page: "saveAll.scope.page",
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

/** Save every unsaved word at once (mock Toolbar "This page"). */
export function SaveAll(props: SaveAllProps) {
  const [infoOpen, setInfoOpen] = useState(false);

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
            <InfoIcon />
          </button>
        </span>
        <span style={{ fontSize: "13px", color: color.ink3 }}>
          {unsavedLine(props.unsavedCount)}
        </span>
      </div>
      {props.onShowWords && (
        <button
          type="button"
          onClick={onlyFromUser(() => props.onShowWords?.())}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            height: "40px",
            margin: 0,
            padding: 0,
            borderRadius: "8px",
            border: `1px solid ${color.lineStrong}`,
            background: color.card,
            color: color.ink,
            font: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <WordListIcon size={18} />
          {t("popup.showWords")}
        </button>
      )}
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
              ...statusButton.learning(false),
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
              ...statusButton.known(true),
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
            <CheckIcon />
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
          {t("saveAll.note")}
        </p>
      )}
    </div>
  );
}
