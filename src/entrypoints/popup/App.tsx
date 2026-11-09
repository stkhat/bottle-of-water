import { browser } from "wxt/browser";
import { t } from "../../i18n/t";

const FONT_STACK =
  "'Inter Variable', 'Inter', 'Noto Sans JP', system-ui, sans-serif";

export function App() {
  return (
    <div
      role="dialog"
      aria-label={t("app.name")}
      style={{
        width: "360px",
        boxSizing: "border-box",
        background: "#FFFFFF",
        color: "#14182B",
        fontFamily: FONT_STACK,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 8px 12px 16px",
          borderBottom: "1px solid #E3E5EA",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: "#0B8A6C",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "14px",
          }}
        >
          L
        </span>
        <span style={{ fontWeight: 700, fontSize: "15px" }}>
          {t("app.name")}
        </span>
        <span style={{ fontSize: "13px", color: "#5A6075" }}>
          {t("app.languagePair")}
        </span>
        <span style={{ flex: 1 }}></span>
        <button
          type="button"
          aria-label={t("popup.openSettings")}
          onClick={() => void browser.runtime.openOptionsPage()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            color: "#3A4056",
            border: 0,
            background: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
