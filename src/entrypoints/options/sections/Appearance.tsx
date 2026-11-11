import type { Settings } from "../../../core/settings";
import { t, type MessageKey } from "../../../i18n/t";
import { ChoiceRow, Section, type SectionProps } from "../rows";

const THEMES: readonly { id: Settings["theme"]; label: MessageKey }[] = [
  { id: "system", label: "settings.appearance.system" },
  { id: "light", label: "settings.appearance.light" },
  { id: "dark", label: "settings.appearance.dark" },
];

export function AppearanceSection(props: SectionProps) {
  return (
    <Section id="appearance" label="settings.section.appearance">
      <ChoiceRow
        title={t("settings.appearance.theme")}
        desc={t("settings.appearance.themeDesc")}
        options={THEMES}
        value={props.settings.theme}
        onPick={(theme) => props.change({ theme })}
      />
    </Section>
  );
}
