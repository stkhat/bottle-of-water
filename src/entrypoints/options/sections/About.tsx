import { t } from "../../../i18n/t";
import { color } from "../../../ui/styles";
import { Section } from "../rows";

export function AboutSection(props: { version: string }) {
  return (
    <Section id="about" label="settings.section.about" gap="8px">
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: 1.6,
          color: color.ink3,
        }}
      >
        {t("settings.about.line", { version: props.version })}
      </p>
    </Section>
  );
}
