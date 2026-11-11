import type { CSSProperties } from "preact";
import type { TermKind } from "../../core/classify";
import { t } from "../../i18n/t";
import { SpeakerIcon } from "../icons";
import { color, IPA_FONT } from "../styles";
import { MachineTranslationMark } from "./MachineTranslationMark";

/** An entry's headword, kind, speak button, IPA, notes and short meaning (dictionary window, word list). */
export function EntryHeader(props: {
  head: string;
  kind: TermKind;
  ipa?: string | undefined;
  /** Extra notes (etymology, related words, pronunciation). */
  sub?: string | undefined;
  short?: string | undefined;
  shortLang: string;
  /** `short` is the browser translator's: marked "Machine translation". */
  machineTranslated?: boolean | undefined;
  onSpeak: () => void;
  speakStyle: CSSProperties;
  /** The speak button's class (the word list's hover rule). */
  speakClass?: string;
}) {
  const short = props.short && (
    <p
      lang={props.shortLang}
      style={{ margin: 0, fontSize: "17px", lineHeight: 1.5 }}
    >
      {props.short}
    </p>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "26px",
            fontWeight: 650,
            letterSpacing: "-0.01em",
          }}
        >
          {props.head}
        </h2>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: color.greenDark,
            background: color.greenPale,
            borderRadius: "999px",
            padding: "3px 9px",
          }}
        >
          {t(props.kind === "word" ? "kind.word" : "kind.phrase")}
        </span>
        <button
          type="button"
          class={props.speakClass}
          aria-label={t("dict.speak")}
          onClick={props.onSpeak}
          style={props.speakStyle}
        >
          <SpeakerIcon />
        </button>
      </div>
      {props.ipa && (
        <span
          style={{ fontFamily: IPA_FONT, fontSize: "16px", color: color.ink3 }}
        >
          {props.ipa}
        </span>
      )}
      {props.sub && (
        <span style={{ fontSize: "13px", color: color.muted }}>
          {props.sub}
        </span>
      )}
      {short && props.machineTranslated ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {short}
          <MachineTranslationMark />
        </div>
      ) : (
        short
      )}
    </div>
  );
}
