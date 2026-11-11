import type { ComponentChildren } from "preact";
import type { Settings, SettingsPatch } from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";
import { RowLabel } from "../../ui/RowLabel";
import { Segmented } from "../../ui/Segmented";
import { color } from "../../ui/styles";
import { Switch } from "../../ui/Switch";

/** What every section gets. */
export interface SectionProps {
  settings: Settings;
  /** Shows the change at once and saves it. */
  change(patch: SettingsPatch): void;
}

export function Section(props: {
  id: string;
  label: MessageKey;
  lead?: string;
  gap?: string;
  children: ComponentChildren;
}) {
  const heading = `${props.id}-heading`;
  return (
    <section
      id={props.id}
      class="card"
      aria-labelledby={heading}
      style={props.gap ? { gap: props.gap } : undefined}
    >
      <h2 id={heading} class="h2">
        {t(props.label)}
      </h2>
      {props.lead && <p class="lead">{props.lead}</p>}
      {props.children}
    </section>
  );
}

export function SwitchRow(props: {
  title: string;
  desc: string;
  /** The switch's name; the title by default. */
  label?: string;
  checked: boolean;
  onToggle: () => void;
  /** The section's first row: no line above. */
  first?: boolean;
  before?: ComponentChildren;
}) {
  return (
    <div
      class="row"
      style={props.first ? { borderTop: 0, paddingTop: 0 } : undefined}
    >
      {props.before}
      <RowLabel title={props.title} desc={props.desc} />
      <Switch
        size="large"
        checked={props.checked}
        label={props.label ?? props.title}
        onToggle={props.onToggle}
      />
    </div>
  );
}

/** A row with a few options side by side (mock: "New words you didn't save"). */
export function ChoiceRow<T extends string>(props: {
  title: string;
  desc: string;
  options: readonly { id: T; label: MessageKey }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div class="row">
      <RowLabel title={props.title} desc={props.desc} />
      <Segmented
        label={props.title}
        options={props.options.map((o) => ({ ...o, label: t(o.label) }))}
        value={props.value}
        onPick={props.onPick}
        style={{ display: "inline-flex", flex: "none" }}
        button={(selected) => ({
          height: "34px",
          padding: "0 14px",
          fontWeight: 600,
          ...(!selected && { color: color.muted }),
        })}
      />
    </div>
  );
}

export function LaterRow(props: { title: string; desc: string }) {
  return (
    <div class="row">
      <RowLabel title={props.title} desc={props.desc} />
      <span class="soon">{t("settings.comingLater")}</span>
    </div>
  );
}
