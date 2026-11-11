import type { CSSProperties, JSX } from "preact";
import type { TermKind, WordStatus } from "../../core/classify";
import { t } from "../../i18n/t";
import { CloseIcon, GripIcon } from "../icons";
import { keepOpen } from "../keep-open";
import {
  SERIF_FONT,
  badge,
  color,
  iconButton,
  root,
  sectionHeading,
  termMark,
} from "../styles";
import { useDrag } from "../useDrag";
import { ElsewhereRow, type ElsewhereItem } from "./ElsewhereRow";
import { EntryHeader } from "./EntryHeader";
import { MachineTranslationMark } from "./MachineTranslationMark";
import { StatusButtons } from "./StatusButtons";

export interface DictionaryEntryView {
  head: string;
  kind: TermKind;
  ipa?: string;
  /** Extra notes (etymology, related words, pronunciation). */
  sub?: string;
  short?: string;
  /** Language of `short` when it is not the native language (an English definition). */
  shortLang?: string;
  /**
   * `short` is the browser translator's literal translation: marked "Machine
   * translation" next to it.
   */
  machineTranslated?: boolean;
  /**
   * `translated`: the browser translator's translation of the sense, shown with `text`
   * below it; any translated sense marks the Meanings heading "Machine translation".
   * `hint`: a translation table's English sense, shown above its native words.
   */
  senses: { pos?: string; text: string; hint?: string; translated?: string }[];
  /**
   * Language of the senses' `text` when it is not the native language (an English
   * definition).
   */
  glossLang?: string;
}

/** Another occurrence in the same video (with its time; clicking seeks) or page. */
interface HereItem {
  time?: string;
  text: string;
  /** The term's place in `text` (each part of a phrase with a gap), drawn highlighted. */
  marks?: { start: number; end: number; category: WordStatus }[];
  onClick?: () => void;
}

interface CommonProps {
  entry: DictionaryEntryView;
  /** Language of the translation and meanings, for their `lang` attribute. */
  nativeLang: string;
  /** Language of the entry's sentences (the language being learned), for their `lang` attribute. */
  learningLang: string;
  status: WordStatus;
  onStatus: (status: WordStatus) => void;
  onSpeak: () => void;
  dictionaries: { label: string; href: string }[];
  here: { source: "video" | "page"; items: HereItem[] };
  /**
   * Other sources the entry was met in: a saved entry's occurrences, or for an unsaved
   * one the sentences kept in the history. An unsaved entry with none shows a note
   * that saving it starts recording.
   */
  elsewhere: ElsewhereItem[];
  onClose: () => void;
}

export type DictionaryWindowProps = CommonProps &
  (
    | {
        /** Mock Main: a floating window dragged by its handle. */
        variant: "window";
        /** Start position and height; dragging moves it from there. */
        frame: { left: number; top: number; height: number };
        /** Mock Fullscreen: over the video, with a darker shadow. */
        fullscreen?: boolean;
      }
    | {
        /** Mock Article: a panel floating on the right side. */
        variant: "panel";
        frame: { top: number; right: number; bottom: number };
      }
  );

type Style = CSSProperties;

const BOX: Style = {
  position: "fixed",
  zIndex: 2147483647,
  display: "flex",
  flexDirection: "column",
  background: color.card,
  border: `1px solid ${color.line}`,
  borderRadius: "14px",
};

export function DictionaryWindow(props: DictionaryWindowProps) {
  const isWindow = props.variant === "window";
  const start =
    props.variant === "window"
      ? { left: props.frame.left, top: props.frame.top }
      : { left: 0, top: 0 };
  const drag = useDrag<HTMLElement>(start);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    props.onClose();
  }

  // Mock Article's icon buttons are a shade lighter.
  const icon: Style = isWindow
    ? iconButton
    : { ...iconButton, color: color.ink2 };
  const closeButton = (
    <button
      type="button"
      aria-label={t("dict.close")}
      onClick={props.onClose}
      style={icon}
    >
      <CloseIcon size={18} stroke={1.8} />
    </button>
  );
  const content = <Content {...props} icon={icon} />;

  if (props.variant === "window") {
    return (
      <aside
        ref={drag.ref}
        aria-label={t("dict.window")}
        onKeyDown={onKeyDown}
        onPointerDown={keepOpen}
        style={root({
          ...BOX,
          left: `${drag.pos.left}px`,
          top: `${drag.pos.top}px`,
          width: "360px",
          height: `${props.frame.height}px`,
          boxShadow: props.fullscreen
            ? "0 18px 48px rgba(0,0,0,0.45)"
            : "0 18px 48px rgba(20,24,43,0.22)",
          overflow: "hidden",
        })}
      >
        <div
          style={{
            height: "44px",
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 4px 0 10px",
            borderBottom: `1px solid ${color.line}`,
            background: color.surface,
          }}
        >
          <button
            type="button"
            aria-label={t("dict.move")}
            onPointerDown={drag.onPointerDown}
            style={{
              ...iconButton,
              width: "28px",
              height: "32px",
              cursor: "grab",
              color: color.muted,
              touchAction: "none",
            }}
          >
            <GripIcon />
          </button>
          <span style={badge(22, 6, 11)}>L</span>
          <span style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>
            {t("dict.title")}
          </span>
          {closeButton}
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 20px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          {content}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("dict.title")}
      onKeyDown={onKeyDown}
      onPointerDown={keepOpen}
      style={root({
        ...BOX,
        top: `${props.frame.top}px`,
        right: `${props.frame.right}px`,
        bottom: `${props.frame.bottom}px`,
        width: "340px",
        padding: "16px 20px 24px",
        boxShadow: "0 16px 40px rgba(20,20,30,0.12)",
        overflowY: "auto",
        gap: "20px",
      })}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={sectionHeading}>{t("dict.title")}</span>
        {closeButton}
      </div>
      {content}
    </aside>
  );
}

function Content(props: DictionaryWindowProps & { icon: Style }) {
  const { entry, status } = props;
  const glossLang = entry.glossLang ?? props.nativeLang;
  const translated = entry.senses.some((sense) => sense.translated);
  const meanings = <h3 style={sectionHeading}>{t("dict.meanings")}</h3>;

  return (
    <>
      <EntryHeader
        head={entry.head}
        kind={entry.kind}
        ipa={entry.ipa}
        sub={entry.sub}
        short={entry.short}
        shortLang={entry.shortLang ?? props.nativeLang}
        machineTranslated={entry.machineTranslated}
        onSpeak={props.onSpeak}
        speakStyle={props.icon}
      />

      <StatusButtons
        status={status}
        onStatus={props.onStatus}
        removeBorder={
          props.variant === "window" ? color.chipLine : color.knownLine
        }
      />

      {entry.senses.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // Mock TranslatedSenses: a translated sense takes two lines.
            gap: translated ? "12px" : "10px",
          }}
        >
          {translated ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              {meanings}
              <MachineTranslationMark />
            </div>
          ) : (
            meanings
          )}
          {entry.senses.map((sense, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              {sense.pos && (
                <span
                  data-pos
                  style={{
                    fontSize: "13px",
                    fontStyle: "italic",
                    color: color.greenText,
                  }}
                >
                  {sense.pos}
                </span>
              )}
              {sense.translated ? (
                <>
                  <span
                    lang={props.nativeLang}
                    style={{ fontSize: "15px", lineHeight: 1.55 }}
                  >
                    {sense.translated}
                  </span>
                  <span
                    lang={glossLang}
                    style={{
                      fontSize: "13px",
                      lineHeight: 1.5,
                      color: color.muted,
                    }}
                  >
                    {sense.text}
                  </span>
                </>
              ) : (
                <>
                  {sense.hint && (
                    // Mock TranslatedSenses: a translation table's English sense
                    // above its words in the native language.
                    <span
                      lang="en"
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: color.muted,
                      }}
                    >
                      {sense.hint}
                    </span>
                  )}
                  <span
                    lang={glossLang}
                    style={{ fontSize: "15px", lineHeight: 1.55 }}
                  >
                    {sense.text}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {props.dictionaries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h3 style={sectionHeading}>{t("dict.dictionaries")}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {props.dictionaries.map((d) => (
              <a
                key={d.href}
                href={d.href}
                target="_blank"
                rel="noopener"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "32px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  background: color.surface,
                  border: `1px solid ${color.line}`,
                  color: color.ink2,
                  textDecoration: "none",
                  fontSize: "13px",
                }}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {props.here.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={sectionHeading}>
            {t(props.here.source === "video" ? "dict.inVideo" : "dict.onPage", {
              count: props.here.items.length,
            })}
          </h3>
          {props.here.items.map((item, i) => (
            <HereRow
              key={i}
              item={item}
              source={props.here.source}
              lang={props.learningLang}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <h3 style={sectionHeading}>
          {t("dict.elsewhere", { count: props.elsewhere.length })}
        </h3>
        {props.elsewhere.map((item, i) => (
          <ElsewhereRow key={i} item={item} lang={props.learningLang} />
        ))}
        {props.status === "new" && props.elsewhere.length === 0 && (
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              lineHeight: 1.5,
              color: color.muted,
            }}
          >
            {t("dict.notSavedNote")}
          </p>
        )}
      </div>
    </>
  );
}

function HereRow(props: {
  item: HereItem;
  source: "video" | "page";
  /** The sentence's language. */
  lang: string;
}) {
  const { item } = props;
  const style: Style =
    props.source === "video"
      ? {
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          width: "100%",
          boxSizing: "border-box",
          textAlign: "left",
          padding: "8px 10px",
          margin: 0,
          border: 0,
          borderRadius: "8px",
          background: color.surface,
          color: color.ink,
          font: "inherit",
          fontSize: "13px",
          lineHeight: 1.5,
        }
      : {
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          textAlign: "left",
          padding: "8px 10px",
          margin: 0,
          border: 0,
          borderRadius: "8px",
          background: color.surface,
          fontFamily: SERIF_FONT,
          fontSize: "14px",
          lineHeight: 1.55,
          color: color.ink2,
        };
  const children = (
    <>
      {item.time && (
        <span
          style={{
            flex: "none",
            fontVariantNumeric: "tabular-nums",
            color: color.greenText,
            fontWeight: 600,
          }}
        >
          {item.time}
        </span>
      )}
      <span lang={props.lang}>{marked(item)}</span>
    </>
  );
  return item.onClick ? (
    <button
      type="button"
      onClick={item.onClick}
      style={{ ...style, cursor: "pointer" }}
    >
      {children}
    </button>
  ) : (
    <div style={style}>{children}</div>
  );
}

/** The item's text with its marks highlighted as in the transcript. */
function marked(item: HereItem) {
  const marks = [...(item.marks ?? [])].sort((a, b) => a.start - b.start);
  const out: (string | JSX.Element)[] = [];
  let at = 0;
  for (const mark of marks) {
    if (mark.start < at) continue;
    if (mark.start > at) out.push(item.text.slice(at, mark.start));
    out.push(
      <span
        key={mark.start}
        data-mark
        style={{
          ...termMark(mark.category, "ui"),
          padding: "0 2px",
          borderRadius: "4px",
        }}
      >
        {item.text.slice(mark.start, mark.end)}
      </span>,
    );
    at = mark.end;
  }
  if (at < item.text.length) out.push(item.text.slice(at));
  return out;
}
