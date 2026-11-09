import { t, type MessageKey } from "../../i18n/t";

const FONT_STACK =
  "'Inter Variable', 'Inter', 'Noto Sans JP', system-ui, sans-serif";

const SECTIONS = [
  { id: "languages", label: "settings.section.languages" },
  { id: "level", label: "settings.section.level" },
  { id: "highlighting", label: "settings.section.highlighting" },
  { id: "dictionaries", label: "settings.section.dictionaries" },
  { id: "video", label: "settings.section.video" },
  { id: "sites", label: "settings.section.sites" },
  { id: "sync", label: "settings.section.sync" },
  { id: "about", label: "settings.section.about" },
] as const satisfies readonly { id: string; label: MessageKey }[];

const CSS = `
.nav{display:flex;align-items:center;height:40px;padding:0 12px;border-radius:8px;color:#2A2F45;text-decoration:none;font-size:14px}
.nav:hover{background:#EEF0F3;color:#14182B}
.card{background:#FFFFFF;border:1px solid #E3E5EA;border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px}
.h2{margin:0;font-size:18px;font-weight:700}
`;

export function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        gap: "40px",
        padding: "40px 120px",
        background: "#F6F7F9",
        color: "#14182B",
        fontFamily: FONT_STACK,
      }}
    >
      <style>{CSS}</style>
      <nav
        aria-label={t("settings.navLabel")}
        style={{
          width: "220px",
          flex: "none",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 12px 20px",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "9px",
              background: "#0B8A6C",
              color: "#FFFFFF",
              fontWeight: 700,
              fontSize: "16px",
            }}
          >
            L
          </span>
          <span style={{ fontSize: "18px", fontWeight: 700 }}>
            {t("settings.title")}
          </span>
        </div>
        {SECTIONS.map((s, i) => (
          <a
            key={s.id}
            class="nav"
            href={`#${s.id}`}
            style={
              i === 0
                ? { background: "#E6F6F0", color: "#075C49", fontWeight: 600 }
                : undefined
            }
          >
            {t(s.label)}
          </a>
        ))}
      </nav>
      <main
        style={{
          flex: 1,
          maxWidth: "800px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} class="card">
            <h2 class="h2">{t(s.label)}</h2>
          </section>
        ))}
      </main>
    </div>
  );
}
