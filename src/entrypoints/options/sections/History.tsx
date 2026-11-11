import { t } from "../../../i18n/t";
import type { HistoryStatus } from "../../../messaging/protocol";
import { fmt, megabytes } from "../../../ui/format/format";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { Section, SwitchRow, type SectionProps } from "../rows";

function pagesLine(pages: number): string {
  if (pages === 0) return t("settings.history.empty");
  return pages === 1
    ? t("settings.history.onePage")
    : t("settings.history.pages", { count: fmt(pages) });
}

export function HistorySection(
  props: SectionProps & {
    history: HistoryStatus | undefined;
    onClear: () => void;
  },
) {
  const { settings, history } = props;
  // Any history at all shows on the meter.
  const share =
    history && history.cap > 0 && history.bytes > 0
      ? Math.min(100, Math.max(1, (history.bytes / history.cap) * 100))
      : 0;
  return (
    <Section
      id="history"
      label="settings.section.history"
      lead={t("settings.history.lead")}
    >
      <SwitchRow
        title={t("settings.history.switch")}
        desc={t("settings.history.switchDesc")}
        checked={settings.sentenceHistory}
        onToggle={() =>
          props.change({ sentenceHistory: !settings.sentenceHistory })
        }
      />
      <div
        class="row"
        style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
          }}
        >
          <span style={{ fontWeight: 600 }}>{t("settings.history.space")}</span>
          <span style={{ color: color.ink3 }}>
            {history &&
              t("settings.history.spaceUsed", {
                used: megabytes(history.bytes),
                cap: megabytes(history.cap),
              })}
          </span>
        </div>
        <Meter share={share} />
        <span style={{ fontSize: "13px", color: color.muted }}>
          {history && pagesLine(history.pages)}
        </span>
      </div>
      <div class="row">
        <RowLabel
          title={t("settings.history.clear")}
          desc={t("settings.history.clearDesc")}
        />
        <button class="btn" type="button" onClick={props.onClear}>
          {t("settings.history.clearButton")}
        </button>
      </div>
    </Section>
  );
}
