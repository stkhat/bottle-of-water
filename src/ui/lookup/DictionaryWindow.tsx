import type { CSSProperties, JSX } from "preact";
import { t } from "../../i18n/t";
import type { WordStatus } from "./HoverCard";
import { keepOpen } from "./keep-open";
import { MachineTranslationMark } from "./MachineTranslationMark";
import {
  IPA_FONT,
  SERIF_FONT,
  badge,
  color,
  iconButton,
  root,
  sectionHeading,
  termMark,
} from "./styles";
import { StatusButtons } from "./StatusButtons";
import { useDrag } from "./useDrag";

export interface DictionaryEntryView {
  head: string;
  kind: "word" | "phrase";
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
   */
  /** `hint`: a translation table's English sense, shown above its native words. */
  senses: { pos?: string; text: string; hint?: string; translated?: string }[];
  /**
   * Language of the senses' `text` when it is not the native language (an English
   * definition).
   */
  glossLang?: string;
}

/** Another occurrence in the same video (with its time; clicking seeks) or page. */
export interface HereItem {
  time?: string;
  text: string;
  /** The term's place in `text` (each part of a phrase with a gap), drawn highlighted. */
  marks?: {
    start: number;
    end: number;
    category: "new" | "learning" | "known";
  }[];
  onClick?: () => void;
}

/** An occurrence in another source. */
export interface ElsewhereItem {
  title: string;
  meta: string;
  text: string;
  href?: string;
  video: boolean;
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

const CLOSE_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18"></path>
  </svg>
);

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
      {CLOSE_ICON}
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
            <svg
              width="14"
              height="18"
              viewBox="0 0 14 18"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="4" cy="4" r="1.5"></circle>
              <circle cx="10" cy="4" r="1.5"></circle>
              <circle cx="4" cy="9" r="1.5"></circle>
              <circle cx="10" cy="9" r="1.5"></circle>
              <circle cx="4" cy="14" r="1.5"></circle>
              <circle cx="10" cy="14" r="1.5"></circle>
            </svg>
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
  const short = entry.short && (
    <p
      lang={entry.shortLang ?? props.nativeLang}
      style={{ margin: 0, fontSize: "17px", lineHeight: 1.5 }}
    >
      {entry.short}
    </p>
  );

  return (
    <>
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
            {entry.head}
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
            {t(
              entry.kind === "word" ? "lookup.kind.word" : "lookup.kind.phrase",
            )}
          </span>
          <button
            type="button"
            aria-label={t("dict.speak")}
            onClick={props.onSpeak}
            style={props.icon}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
              <path d="M16 9a4 4 0 0 1 0 6"></path>
              <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"></path>
            </svg>
          </button>
        </div>
        {entry.ipa && (
          <span
            style={{
              fontFamily: IPA_FONT,
              fontSize: "16px",
              color: color.ink3,
            }}
          >
            {entry.ipa}
          </span>
        )}
        {entry.sub && (
          <span style={{ fontSize: "13px", color: color.muted }}>
            {entry.sub}
          </span>
        )}
        {short && entry.machineTranslated ? (
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

/** An occurrence in another source: its icon, title, meta and sentence; a link when it has one. */
export function ElsewhereRow(props: {
  item: ElsewhereItem;
  /** The sentence's language. */
  lang: string;
}) {
  const { item } = props;
  const style: Style = {
    display: "flex",
    gap: "10px",
    padding: "10px",
    borderRadius: "8px",
    background: color.surface,
    color: "inherit",
    textDecoration: "none",
  };
  const children = (
    <>
      <span style={{ flex: "none", color: color.muted, paddingTop: "1px" }}>
        {item.video ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
            role="img"
            aria-label={t("dict.source.video")}
          >
            <rect x="3" y="6" width="13" height="12" rx="2"></rect>
            <path d="M16 10l5-3v10l-5-3z"></path>
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
            role="img"
            aria-label={t("dict.source.page")}
          >
            <path d="M6 3h9l4 4v14H6z"></path>
            <path d="M9 12h7M9 16h7M9 8h3"></path>
          </svg>
        )}
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4 }}>
          {item.title}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {item.meta}
        </span>
        <span
          lang={props.lang}
          style={{ fontSize: "13px", lineHeight: 1.5, color: color.ink3 }}
        >
          {item.text}
        </span>
      </span>
    </>
  );
  return item.href ? (
    <a href={item.href} target="_blank" rel="noopener" style={style}>
      {children}
    </a>
  ) : (
    <div style={style}>{children}</div>
  );
}
