import type { CSSProperties } from "preact";
import type { Answer } from "../../core/explain/answer";
import { t } from "../../i18n/t";
import { SparkleIcon } from "../icons";
import { Meter } from "../Meter";
import { color, sectionHeading } from "../styles";

/**
 * What "In this sentence" shows (mock ContextMeaning): the button, the model to
 * download, its download, the placeholder while the model reads ("Thinking…", or
 * "Starting on-device AI…" while the model itself is slow to start), the answer, or
 * the error with Try again.
 */
export type ExplainView =
  | { state: "idle" }
  | { state: "download" }
  | { state: "downloading"; /** 0 to 1 */ loaded: number }
  | { state: "reading" }
  | { state: "starting" }
  | { state: "answer"; answer: Answer }
  | { state: "error" };

export interface InThisSentenceProps {
  view: ExplainView;
  /** The answer's language. */
  nativeLang: string;
  /** For "Chrome's on-device AI is downloaded once…" (`BrowserEnv.name`). */
  browserName: string;
  /** The entry has dictionary meanings: the answer may say none of them fits. */
  hasSenses: boolean;
  /** The answer's meaning is the one chosen for this sentence: "Used here". */
  usedHere: boolean;
  onExplain(): void;
  /** In the click: the download needs its user activation. */
  onDownload(): void;
  onRetry(): void;
  /** "Use this meaning", or undoing "Used here". */
  onUse(): void;
}

type Style = CSSProperties;

/** Mock `.explain`; its hover from the shadow root's style sheet. */
const EXPLAIN_BUTTON: Style = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  height: "40px",
  padding: "0 16px",
  margin: 0,
  borderRadius: "8px",
  border: `1px solid ${color.greenLine}`,
  background: color.greenPale,
  color: color.greenDark,
  font: "inherit",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

/** Mock `.aic`: the card every state but the button is in. */
const CARD: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "14px",
  borderRadius: "10px",
  background: color.surface,
  border: `1px solid ${color.line}`,
};

/** Mock `.aix`. */
const TEXT: Style = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.6,
  color: color.ink2,
};

/** Mock `.aimeta`. */
const META: Style = { fontSize: "12px", color: color.muted };

const CSS = [
  `[data-explain]:hover{background:${color.hlLearning}}`,
  `@keyframes langle-pulse{0%,100%{opacity:1}50%{opacity:.45}}`,
  `[data-pulse]{animation:langle-pulse 1.2s ease-in-out infinite}`,
  `@media (prefers-reduced-motion: reduce){[data-pulse]{animation:none}}`,
].join("\n");

/** The card's "Use this meaning" / "Used here" (mock ContextMeaning `use`). */
const useButton = (pressed: boolean): Style => ({
  height: "34px",
  padding: "0 14px",
  margin: 0,
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  ...(pressed
    ? {
        background: color.green,
        color: color.white,
        border: `1px solid ${color.green}`,
      }
    : {
        background: color.card,
        color: color.greenDark,
        border: `1px solid ${color.greenLine}`,
      }),
});

/**
 * "In this sentence" in the dictionary window (ui.md "Meaning in context and your
 * meanings"): the on-device AI's meaning of the term in the sentence it was met in.
 */
export function InThisSentence(props: InThisSentenceProps) {
  return (
    <section
      aria-label={t("dict.inSentence")}
      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <style>{CSS}</style>
      <h3 style={sectionHeading}>{t("dict.inSentence")}</h3>
      <State {...props} />
    </section>
  );
}

function State(props: InThisSentenceProps) {
  const { view } = props;
  switch (view.state) {
    case "idle":
      return (
        <button
          type="button"
          data-explain
          onClick={props.onExplain}
          style={EXPLAIN_BUTTON}
        >
          <SparkleIcon />
          {t("dict.explain")}
        </button>
      );
    case "download":
      return (
        <div style={CARD}>
          <p style={TEXT}>
            {t("dict.explain.download", { browser: props.browserName })}
          </p>
          <button
            type="button"
            data-explain
            onClick={props.onDownload}
            style={EXPLAIN_BUTTON}
          >
            {t("dict.explain.downloadAndExplain")}
          </button>
        </div>
      );
    case "downloading": {
      const percent = Math.floor(view.loaded * 100);
      return (
        <div role="status" style={CARD}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {t("dict.explain.downloading")}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {`${percent}%`}
            </span>
          </div>
          <Meter share={percent} />
        </div>
      );
    }
    case "reading":
    case "starting":
      return (
        <div role="status" aria-label={t("dict.explain.busy")} style={CARD}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {["55%", "92%", "74%"].map((width) => (
              <span
                key={width}
                data-pulse
                style={{
                  display: "block",
                  width,
                  height: "12px",
                  borderRadius: "6px",
                  background: color.line,
                }}
              ></span>
            ))}
          </div>
          <span style={META}>
            {t(
              view.state === "starting"
                ? "dict.explain.starting"
                : "dict.explain.thinking",
            )}
          </span>
        </div>
      );
    case "answer":
      return <AnswerCard {...props} view={view} />;
    case "error":
      return (
        <div style={CARD}>
          <p style={TEXT}>{t("dict.explain.error")}</p>
          <button
            type="button"
            data-explain
            onClick={props.onRetry}
            style={EXPLAIN_BUTTON}
          >
            {t("dict.explain.retry")}
          </button>
        </div>
      );
  }
}

/** The meaning and "Use this meaning". */
function AnswerCard(
  props: InThisSentenceProps & {
    view: Extract<ExplainView, { state: "answer" }>;
  },
) {
  const { answer } = props.view;
  return (
    <div style={CARD}>
      <p
        lang={props.nativeLang}
        style={{
          margin: 0,
          fontSize: "16px",
          fontWeight: 600,
          lineHeight: 1.45,
        }}
      >
        {answer.meaning}
      </p>
      {props.hasSenses && answer.sense === null && (
        <span style={META}>{t("dict.explain.noFit")}</span>
      )}
      {/* Neither breaks inside: where the row is too narrow for both, "On-device
          AI" moves under the button, still at the right. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 10px",
          marginTop: "2px",
        }}
      >
        <button
          type="button"
          aria-pressed={props.usedHere ? "true" : "false"}
          onClick={props.onUse}
          style={{ ...useButton(props.usedHere), whiteSpace: "nowrap" }}
        >
          {t(props.usedHere ? "dict.usedHere" : "dict.explain.use")}
        </button>
        <span style={{ ...META, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {t("dict.explain.meta")}
        </span>
      </div>
    </div>
  );
}
