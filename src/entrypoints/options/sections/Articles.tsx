import { t } from "../../../i18n/t";
import { Section, SwitchRow, type SectionProps } from "../rows";

export function ArticlesSection(props: SectionProps) {
  const { articleMainOnly } = props.settings;
  return (
    <Section
      id="articles"
      label="settings.section.articles"
      lead={t("settings.articles.lead")}
    >
      <SwitchRow
        first
        title={t("settings.articles.mainOnly")}
        desc={t("settings.articles.mainOnlyDesc")}
        checked={articleMainOnly}
        onToggle={() => props.change({ articleMainOnly: !articleMainOnly })}
      />
    </Section>
  );
}
