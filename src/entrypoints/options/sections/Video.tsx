import { t } from "../../../i18n/t";
import { color } from "../../../ui/styles";
import { Section, SwitchRow, type SectionProps } from "../rows";

const POSITIONS = [
  {
    id: "inVideo",
    label: "settings.video.inVideo",
    desc: "settings.video.inVideoDesc",
    bar: { bottom: "10px" },
  },
  {
    id: "belowVideo",
    label: "settings.video.belowVideo",
    desc: "settings.video.belowVideoDesc",
    bar: { bottom: "-16px" },
  },
] as const;

/** The pictures draw a video frame and its subtitle, dark in both themes. */
const VIDEO_FRAME = "#14182B";

export function VideoSection(props: SectionProps) {
  const s = props.settings;
  return (
    <Section
      id="video"
      label="settings.section.video"
      lead={t("settings.video.lead")}
    >
      <div
        role="group"
        aria-label={t("subtitle.position")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {POSITIONS.map((p) => {
          const on = s.subtitlePosition === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => props.change({ subtitlePosition: p.id })}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "6px",
                padding: "16px",
                margin: 0,
                borderRadius: "12px",
                font: "inherit",
                color: color.ink,
                textAlign: "left",
                cursor: "pointer",
                ...(on
                  ? {
                      background: color.greenPale,
                      border: `2px solid ${color.green}`,
                    }
                  : {
                      background: color.card,
                      border: `2px solid ${color.line}`,
                    }),
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "relative",
                  display: "block",
                  width: "160px",
                  height: "90px",
                  marginBottom: "18px",
                  borderRadius: "6px",
                  background: VIDEO_FRAME,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "30px",
                    right: "30px",
                    height: "10px",
                    borderRadius: "3px",
                    background: on ? "#6FE3C3" : "#C9CDD6",
                    ...p.bar,
                  }}
                ></span>
              </span>
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                {t(p.label)}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  lineHeight: 1.45,
                  color: color.muted,
                }}
              >
                {t(p.desc)}
              </span>
            </button>
          );
        })}
      </div>
      <SwitchRow
        title={t("subtitle.translation")}
        desc={t("settings.video.subtitleTranslationDesc")}
        checked={s.subtitleTranslation}
        onToggle={() =>
          props.change({ subtitleTranslation: !s.subtitleTranslation })
        }
      />
      <SwitchRow
        title={t("transcript.translation")}
        desc={t("settings.video.transcriptTranslationDesc")}
        checked={s.transcriptTranslation}
        onToggle={() =>
          props.change({ transcriptTranslation: !s.transcriptTranslation })
        }
      />
    </Section>
  );
}
