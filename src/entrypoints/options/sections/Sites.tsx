import { useEffect, useRef, useState } from "preact/hooks";
import { siteFromInput } from "../../../core/url";
import { t } from "../../../i18n/t";
import { CloseIcon } from "../../../ui/icons";
import { color } from "../../../ui/styles";
import { Section, SwitchRow, type SectionProps } from "../rows";

const SITES = [
  {
    id: "youtube",
    label: "platform.youtube",
    desc: "settings.sites.youtubeDesc",
  },
  {
    id: "youtubeComments",
    label: "settings.sites.youtubeComments",
    desc: "settings.sites.youtubeCommentsDesc",
  },
  {
    id: "netflix",
    label: "platform.netflix",
    desc: "settings.sites.netflixDesc",
  },
  {
    id: "articles",
    label: "settings.sites.articles",
    desc: "settings.sites.articlesDesc",
  },
] as const;

/** "Never run on": the hosts as chips, each removable, and an inline field to add one. */
function NeverRunOn(props: {
  sites: readonly string[];
  onChange: (sites: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  function close() {
    setAdding(false);
    setText("");
    setInvalid(false);
  }

  function add() {
    const site = siteFromInput(text);
    if (!site) {
      setInvalid(true);
      return;
    }
    if (!props.sites.includes(site)) props.onChange([...props.sites, site]);
    close();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "14px", fontWeight: 600 }}>
        {t("settings.sites.never")}
      </span>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {props.sites.map((site) => (
          <span
            key={site}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              height: "32px",
              padding: "0 4px 0 12px",
              borderRadius: "999px",
              background: color.surfaceGray,
              fontSize: "13px",
            }}
          >
            {site}
            <button
              type="button"
              aria-label={t("settings.sites.remove", { site })}
              onClick={() =>
                props.onChange(props.sites.filter((s) => s !== site))
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                border: 0,
                borderRadius: "12px",
                background: "none",
                color: color.ink3,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <CloseIcon size={14} stroke={2} />
            </button>
          </span>
        ))}
        {adding ? (
          <span style={{ display: "inline-flex", gap: "8px" }}>
            <input
              ref={input}
              type="text"
              aria-label={t("settings.sites.addInput")}
              aria-invalid={invalid}
              placeholder="example.com"
              value={text}
              onInput={(e) => {
                setText(e.currentTarget.value);
                setInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                else if (e.key === "Escape") close();
              }}
              style={{
                height: "32px",
                width: "200px",
                boxSizing: "border-box",
                padding: "0 12px",
                border: `1px solid ${invalid ? color.danger : color.lineStrong}`,
                borderRadius: "999px",
                font: "inherit",
                fontSize: "13px",
                color: color.ink,
              }}
            />
            <button
              class="btn"
              type="button"
              onClick={add}
              style={{ height: "32px", fontSize: "13px" }}
            >
              {t("settings.sites.addConfirm")}
            </button>
          </span>
        ) : (
          <button
            class="btn"
            type="button"
            onClick={() => setAdding(true)}
            style={{ height: "32px", fontSize: "13px", borderStyle: "dashed" }}
          >
            {t("settings.sites.add")}
          </button>
        )}
      </div>
      {invalid && (
        <span role="alert" style={{ fontSize: "13px", color: color.danger }}>
          {t("settings.sites.invalid")}
        </span>
      )}
    </div>
  );
}

export function SitesSection(props: SectionProps) {
  const s = props.settings;
  return (
    <Section
      id="sites"
      label="settings.section.sites"
      lead={t("settings.sites.lead")}
    >
      {SITES.map((site) => (
        <SwitchRow
          key={site.id}
          title={t(site.label)}
          desc={t(site.desc)}
          label={t("settings.sites.switch", { site: t(site.label) })}
          checked={s.sites[site.id]}
          onToggle={() =>
            props.change({ sites: { [site.id]: !s.sites[site.id] } })
          }
        />
      ))}
      <NeverRunOn
        sites={s.neverRunOn}
        onChange={(neverRunOn) => props.change({ neverRunOn })}
      />
    </Section>
  );
}
