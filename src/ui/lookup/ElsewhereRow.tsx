import { t } from "../../i18n/t";
import { SourceIcon } from "../icons";
import { color } from "../styles";

/** An occurrence in another source. */
export interface ElsewhereItem {
  title: string;
  meta: string;
  text: string;
  href?: string;
  video: boolean;
}

/** Its icon, title, meta and sentence; a link when it has one. */
export function ElsewhereRow(props: {
  item: ElsewhereItem;
  /** The sentence's language. */
  lang: string;
}) {
  const { item } = props;
  const style = {
    display: "flex",
    gap: "10px",
    padding: "10px",
    borderRadius: "8px",
    background: color.surface,
    color: "inherit",
    textDecoration: "none",
  };
  const children = (
    <>
      <span style={{ flex: "none", color: color.muted, paddingTop: "1px" }}>
        <SourceIcon
          video={item.video}
          label={t(item.video ? "dict.source.video" : "dict.source.page")}
        />
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4 }}>
          {item.title}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {item.meta}
        </span>
        <span
          lang={props.lang}
          style={{ fontSize: "13px", lineHeight: 1.5, color: color.ink3 }}
        >
          {item.text}
        </span>
      </span>
    </>
  );
  return item.href ? (
    <a href={item.href} target="_blank" rel="noopener" style={style}>
      {children}
    </a>
  ) : (
    <div style={style}>{children}</div>
  );
}
