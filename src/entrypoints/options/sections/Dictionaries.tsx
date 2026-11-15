import { useEffect, useRef, useState } from "preact/hooks";
import type { BrowserEnv } from "../../../core/browser-env";
import type {
  ExplainAvailability,
  ExplanationProvider,
} from "../../../core/explain/provider";
import type { LanguagePair } from "../../../core/packs/pairs";
import { t } from "../../../i18n/t";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { Section, SwitchRow, type SectionProps } from "../rows";

const DICTIONARIES = [
  { id: "cambridge", label: "dictionary.cambridge" },
  { id: "wiktionary", label: "dictionary.wiktionary" },
  { id: "reverso", label: "settings.dictionaries.reverso" },
  { id: "wordreference", label: "dictionary.wordreference" },
] as const;

/** The "On-device AI" row: none, its Download, the download's progress (0 to 1), Ready. */
type ModelRow = "none" | "download" | { loaded: number } | "ready";

/** A download Chrome started elsewhere is joined by pressing Download again. */
const rowOf = (availability: ExplainAvailability): ModelRow =>
  availability === "unavailable"
    ? "none"
    : availability === "ready"
      ? "ready"
      : "download";

/**
 * The on-device model for the pair, read each time Settings opens (Chrome removes it
 * when disk space runs low) and when the pair changes; its download.
 */
function useOnDeviceModel(
  provider: ExplanationProvider | undefined,
  pair: LanguagePair,
) {
  const [row, setRow] = useState<ModelRow>("none");
  /** Counts the pairs read: a late answer for another pair is dropped. */
  const reads = useRef(0);
  const warn = (error: unknown) => console.warn("Lingo:", error);

  useEffect(() => {
    if (!provider) return;
    const read = ++reads.current;
    setRow("none");
    provider.availability(pair).then((availability) => {
      if (read === reads.current) setRow(rowOf(availability));
    }, warn);
  }, [provider, pair.learning, pair.native]);

  /** In the click: the download needs its user activation. */
  function download() {
    if (!provider) return;
    const read = reads.current;
    const current = () => read === reads.current;
    setRow({ loaded: 0 });
    provider
      .download(pair, (loaded) => {
        if (current()) setRow({ loaded });
      })
      .then(
        () => {
          if (current()) setRow("ready");
        },
        (error: unknown) => {
          warn(error);
          if (current()) setRow("download");
        },
      );
  }

  return { row, download };
}

/** Download, Downloading with its bar, or Ready (mock Settings "On-device AI"). */
function ModelControl(props: { row: ModelRow; onDownload(): void }) {
  const { row } = props;
  if (row === "download")
    return (
      <button class="btn" type="button" onClick={props.onDownload}>
        {t("settings.ai.download")}
      </button>
    );
  if (row === "ready")
    return (
      <span
        style={{ fontSize: "14px", fontWeight: 600, color: color.greenText }}
      >
        {t("settings.ai.ready")}
      </span>
    );
  if (row === "none") return null;
  const percent = Math.floor(row.loaded * 100);
  return (
    <span
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        width: "180px",
        flex: "none",
      }}
    >
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "13px",
        }}
      >
        <span style={{ fontWeight: 600 }}>{t("settings.ai.downloading")}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {`${percent}%`}
        </span>
      </span>
      <Meter share={percent} />
    </span>
  );
}

export function DictionariesSection(
  props: SectionProps & {
    env: Pick<BrowserEnv, "name">;
    /** The on-device AI; none: no rows for it. */
    explainProvider: ExplanationProvider | undefined;
  },
) {
  const { dictionaries, learningLang, nativeLang, explainUnknown } =
    props.settings;
  const { env } = props;
  const model = useOnDeviceModel(props.explainProvider, {
    learning: learningLang,
    native: nativeLang,
  });
  return (
    <Section
      id="dictionaries"
      label="settings.section.dictionaries"
      lead={t("settings.dictionaries.lead")}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "10px 24px",
        }}
      >
        {DICTIONARIES.map((d) => (
          <label
            key={d.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "14px",
            }}
          >
            <input
              class="chk"
              type="checkbox"
              checked={dictionaries[d.id]}
              onChange={() =>
                props.change({ dictionaries: { [d.id]: !dictionaries[d.id] } })
              }
            />
            {t(d.label)}
          </label>
        ))}
      </div>
      {/* Only where the on-device AI can run for the pair. */}
      {model.row !== "none" && (
        <>
          <div class="row">
            <RowLabel
              title={t("settings.ai.title")}
              desc={t("settings.ai.desc", { browser: env.name })}
            />
            <ModelControl row={model.row} onDownload={model.download} />
          </div>
          <SwitchRow
            title={t("settings.ai.unknown.title")}
            desc={t("settings.ai.unknown.desc")}
            checked={explainUnknown}
            onToggle={() => props.change({ explainUnknown: !explainUnknown })}
          />
        </>
      )}
    </Section>
  );
}
