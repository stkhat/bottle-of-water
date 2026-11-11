import { useState } from "preact/hooks";
import {
  KNOWN_LEVEL_MAX,
  KNOWN_LEVEL_MIN,
  KNOWN_LEVEL_STEP,
} from "../../../core/settings";
import { languageName } from "../../../i18n/languages";
import { t } from "../../../i18n/t";
import { fmt } from "../../../ui/format/format";
import { color } from "../../../ui/styles";
import { Section, type SectionProps } from "../rows";

export function LevelSection(props: SectionProps) {
  const s = props.settings;
  /** The value being dragged, saved when the slider is let go. */
  const [dragged, setDragged] = useState<number>();
  const level = dragged ?? s.knownLevel;
  return (
    <Section
      id="level"
      label="settings.section.level"
      lead={t("settings.level.lead")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <label for="level-range" style={{ fontSize: "15px", fontWeight: 600 }}>
          {t("settings.level.label", {
            count: fmt(level),
            language: languageName(s.learningLang),
          })}
        </label>
        <input
          id="level-range"
          type="range"
          min={KNOWN_LEVEL_MIN}
          max={KNOWN_LEVEL_MAX}
          step={KNOWN_LEVEL_STEP}
          value={level}
          onInput={(e) => setDragged(Number(e.currentTarget.value))}
          onChange={(e) => {
            setDragged(undefined);
            props.change({ knownLevel: Number(e.currentTarget.value) });
          }}
          style={{ width: "100%", accentColor: color.green }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: color.muted,
          }}
        >
          <span>
            {t("settings.level.min", { count: fmt(KNOWN_LEVEL_MIN) })}
          </span>
          <span>
            {t("settings.level.max", { count: fmt(KNOWN_LEVEL_MAX) })}
          </span>
        </div>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          lineHeight: 1.5,
          color: color.muted,
        }}
      >
        {t("settings.level.note")}
      </p>
    </Section>
  );
}
