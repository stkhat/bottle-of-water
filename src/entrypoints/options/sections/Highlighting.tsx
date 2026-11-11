import type { Settings } from "../../../core/settings";
import { t, type MessageKey } from "../../../i18n/t";
import { color, highlight, underline } from "../../../ui/styles";
import { ChoiceRow, Section, SwitchRow, type SectionProps } from "../rows";

const ROWS = [
  {
    id: "new",
    label: "card.chip.new",
    desc: "settings.highlighting.newDesc",
  },
  {
    id: "learning",
    label: "status.learning",
    desc: "settings.highlighting.learningDesc",
  },
  {
    id: "known",
    label: "status.known",
    desc: "settings.highlighting.knownDesc",
  },
] as const;

const UNSAVED_AT_END: readonly {
  id: Settings["unsavedAtEnd"];
  label: MessageKey;
}[] = [
  { id: "keep", label: "settings.highlighting.keepNew" },
  { id: "known", label: "settings.highlighting.markKnown" },
];

/** A word drawn in its category's highlight; only Learning's has a background (mock). */
function Sample(props: { id: (typeof ROWS)[number]["id"] }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "none",
        width: "72px",
        textAlign: "center",
        fontFamily: "Georgia, serif",
        fontSize: "17px",
        padding: "2px 0",
        borderRadius: "4px",
        ...(props.id === "learning" && { background: color.hlLearning }),
        boxShadow: underline(highlight.ui[props.id].underline),
      }}
    >
      {t("settings.highlighting.sample")}
    </span>
  );
}

export function HighlightingSection(props: SectionProps) {
  const s = props.settings;
  return (
    <Section
      id="highlighting"
      label="settings.section.highlighting"
      lead={t("settings.highlighting.lead")}
    >
      {ROWS.map((row) => (
        <SwitchRow
          key={row.id}
          title={t(row.label)}
          desc={t(row.desc)}
          label={t("settings.highlighting.switch", { category: t(row.label) })}
          checked={s.highlight[row.id]}
          onToggle={() =>
            props.change({ highlight: { [row.id]: !s.highlight[row.id] } })
          }
          before={<Sample id={row.id} />}
        />
      ))}
      <ChoiceRow
        title={t("settings.highlighting.unsavedAtEnd")}
        desc={t("settings.highlighting.unsavedAtEndDesc")}
        options={UNSAVED_AT_END}
        value={s.unsavedAtEnd}
        onPick={(unsavedAtEnd) => props.change({ unsavedAtEnd })}
      />
    </Section>
  );
}
