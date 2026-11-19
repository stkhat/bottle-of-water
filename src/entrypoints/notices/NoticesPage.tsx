import type { NoticePack, NoticesData } from "../../core/notices";
import { t } from "../../i18n/t";
import { color, FONT } from "../../ui/styles";

const CSS = `
body{background:${color.surface}}
a{color:${color.greenText}}a:hover{color:${color.greenDark}}
.card{background:${color.card};border:1px solid ${color.line};border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:12px}
.h2{margin:0;font-size:18px;font-weight:700}
.meta{margin:0;font-size:14px;line-height:1.5;color:${color.muted}}
.src{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.src li{display:flex;flex-direction:column;gap:2px;padding-top:12px;border-top:1px solid ${color.soft};font-size:14px;line-height:1.5}
.src .d{color:${color.muted};font-size:13px}
pre{margin:0;white-space:pre-wrap;font-size:12px;line-height:1.5;color:${color.ink2}}
`;

/** A license's name, linked to its text when it has one. */
function License(props: { license: { name: string; url?: string } }) {
  const { name, url } = props.license;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  ) : (
    <>{name}</>
  );
}

function Pack(props: { pack: NoticePack }) {
  const { pack } = props;
  return (
    <section class="card" aria-label={pack.title}>
      <h2 class="h2">{pack.title}</h2>
      <p class="meta">
        {pack.package} · <License license={pack.license} />
        <br />
        {t("notices.changes", { changes: pack.changes })}
      </p>
      <ul class="src">
        {pack.sources.map((source) => (
          <li key={source.title}>
            <span>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              {" · "}
              <License license={source.license} />
            </span>
            <span class="d">
              {source.via ? `${source.by}; ${source.via}` : source.by}
            </span>
            <span class="d">{t("notices.used", { used: source.used })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The data sources and licenses page, opened from Settings → About: every language
 * pack Langle downloads, with its license, changes and sources, then the full notices
 * that WordNet-style licenses ask every copy to carry (mock: Settings `#about`'s
 * "Licenses" link).
 */
export function NoticesPage(props: { data: NoticesData }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        maxWidth: "880px",
        margin: "0 auto",
        padding: "40px 40px 64px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: FONT,
        color: color.ink,
      }}
    >
      <style>{CSS}</style>
      <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>
        {t("notices.title")}
      </h1>
      <p class="meta">{t("notices.lead")}</p>
      {props.data.packs.map((pack) => (
        <Pack key={pack.package} pack={pack} />
      ))}
      <section class="card" aria-labelledby="notices-full">
        <h2 id="notices-full" class="h2">
          {t("notices.full")}
        </h2>
        {props.data.notices.map((notice) => (
          <div
            key={notice.title}
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
              {notice.title}
            </h3>
            <pre>{notice.text}</pre>
          </div>
        ))}
      </section>
    </div>
  );
}
