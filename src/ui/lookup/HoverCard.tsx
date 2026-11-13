import type { CSSProperties } from "preact";
import type { TermKind, WordStatus } from "../../core/classify";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { IPA_FONT, color, root, statusButton } from "../styles";
import { MachineTranslationMark } from "./MachineTranslationMark";

export interface HoverCardProps {
  /** Over a video (mock Main) or an article (mock Article); they differ slightly. */
  variant: "video" | "article";
  kind: TermKind;
  status: WordStatus;
  /** The card of selected words (articles): unsaved, it reads "Selected · not saved". */
  selection?: boolean;
  head: string;
  ipa?: string;
  /**
   * Short translations, one per line, all alike: up to three senses, in the native
   * language (or `shortLang`). None: no translation line.
   */
  meanings?: readonly string[];
  /**
   * The meaning came from the browser's translator (a literal translation or a
   * translated definition; one line): marked "Machine translation".
   */
  machineTranslated?: boolean;
  /** Extra notes (etymology, related words, pronunciation). */
  sub?: string;
  /** The native language: the `lang` of `meanings` unless `shortLang` says otherwise. */
  nativeLang: string;
  /** Language of `meanings` when it is not the native language (an English definition). */
  shortLang?: string;
  onLearning: () => void;
  onKnown: () => void;
  /**
   * Opens the dictionary window (articles: a click on a word inside a link follows
   * the link). Given, the card shows a "Details" button instead of the hint.
   */
  onDetails?: () => void;
}

const BOX = {
  video: {
    width: "300px",
    boxShadow: "0 10px 30px rgba(20,24,43,0.16)",
    kindWeight: 700,
  },
  article: {
    width: "290px",
    boxShadow: "0 14px 36px rgba(20,20,30,0.16)",
    kindWeight: 600,
  },
} as const;

const BUTTON: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: "34px",
  padding: "0 12px",
  margin: 0,
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const STATUS_LABEL = {
  learning: "status.learning",
  known: "status.known",
  new: "lookup.status.new",
} as const;

/** The card shown while hovering a word. It renders the box only; the caller positions it. */
export function HoverCard(props: HoverCardProps) {
  const box = BOX[props.variant];
  const meanings = (props.meanings ?? []).filter(Boolean);
  const known = statusButton.known(props.status === "known");
  if (props.variant === "article" && props.status !== "known")
    known.background = "transparent";

  return (
    <div
      style={root({
        display: "block",
        width: box.width,
        padding: "14px",
        background: color.card,
        border: `1px solid ${color.line}`,
        borderRadius: "12px",
        boxShadow: box.boxShadow,
        fontSize: "14px",
        lineHeight: 1.45,
      })}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "11px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: color.greenText,
            fontWeight: box.kindWeight,
          }}
        >
          {t(props.kind === "word" ? "kind.word" : "kind.phrase")}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {t(
            props.selection && props.status === "new"
              ? "lookup.status.selected"
              : STATUS_LABEL[props.status],
          )}
        </span>
      </div>
      <div style={{ fontSize: "17px", fontWeight: 600, marginTop: "2px" }}>
        {props.head}
      </div>
      {props.ipa && (
        <div
          style={{
            fontFamily: IPA_FONT,
            fontSize: "14px",
            color: color.ink3,
            marginTop: "1px",
          }}
        >
          {props.ipa}
        </div>
      )}
      {meanings.map((meaning, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "15px",
            color: color.ink2,
            marginTop: "2px",
          }}
        >
          <span lang={props.shortLang ?? props.nativeLang}>{meaning}</span>
          {props.machineTranslated && i === meanings.length - 1 && (
            <MachineTranslationMark />
          )}
        </div>
      ))}
      {props.sub && (
        <>
          <div
            data-divider
            style={{ height: "1px", background: color.line, margin: "10px 0" }}
          ></div>
          <div style={{ fontSize: "13px", color: color.muted }}>
            {props.sub}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        <button
          type="button"
          aria-pressed={props.status === "learning"}
          onClick={onlyFromUser(() => props.onLearning())}
          style={{
            ...BUTTON,
            ...statusButton.learning(props.status === "learning"),
          }}
        >
          {t("hover.addLearning")}
        </button>
        <button
          type="button"
          aria-pressed={props.status === "known"}
          onClick={onlyFromUser(() => props.onKnown())}
          style={{ ...BUTTON, ...known }}
        >
          {t("status.known")}
        </button>
        {props.onDetails && (
          <button
            type="button"
            onClick={onlyFromUser(() => props.onDetails?.())}
            style={{
              ...BUTTON,
              ...statusButton.known(false),
              background: "transparent",
            }}
          >
            {t("hover.details")}
          </button>
        )}
      </div>
      {!props.onDetails && (
        <div style={{ marginTop: "8px", fontSize: "12px", color: color.muted }}>
          {t("hover.hint")}
        </div>
      )}
    </div>
  );
}
