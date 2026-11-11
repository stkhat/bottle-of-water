import type { BrowserEnv } from "../../../core/browser-env";
import { t } from "../../../i18n/t";
import { LaterRow, Section, type SectionProps } from "../rows";

const DICTIONARIES = [
  { id: "cambridge", label: "dictionary.cambridge" },
  { id: "wiktionary", label: "dictionary.wiktionary" },
  { id: "reverso", label: "settings.dictionaries.reverso" },
  { id: "wordreference", label: "dictionary.wordreference" },
] as const;

export function DictionariesSection(
  props: SectionProps & { env: Pick<BrowserEnv, "name" | "features"> },
) {
  const { dictionaries } = props.settings;
  const { env } = props;
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
      <LaterRow
        title={t("settings.ai.title")}
        desc={
          env.features.builtInAi
            ? t("settings.ai.descBuiltIn", { browser: env.name })
            : t("settings.ai.desc")
        }
      />
    </Section>
  );
}
