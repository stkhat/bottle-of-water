import { badge, color } from "./styles";

const SIZES = {
  popup: { badge: badge(28, 8, 14), title: "15px", pair: "13px" },
  settings: { badge: badge(32, 9, 16), title: "18px", pair: "14px" },
  page: { badge: badge(32, 9, 16), title: "22px", pair: "14px" },
};

/**
 * The "L" badge, the page's title and the language pair, for the caller's flex row.
 * `stacked` puts the pair under the title (the popup, whose header also holds its
 * buttons and the Lingo switch); a pair too long for the room left ends in "…".
 */
export function BrandHeader(props: {
  size: keyof typeof SIZES;
  title: string;
  /** "English → Japanese". */
  pair?: string;
  /** The title is the page's `<h1>`. */
  heading?: boolean;
  stacked?: boolean;
}) {
  const size = SIZES[props.size];
  const Title = props.heading ? "h1" : "span";
  const title = (
    <Title style={{ margin: 0, fontSize: size.title, fontWeight: 700 }}>
      {props.title}
    </Title>
  );
  const pair = (extra: object = {}) =>
    props.pair !== undefined && (
      <span style={{ fontSize: size.pair, color: color.muted, ...extra }}>
        {props.pair}
      </span>
    );
  return (
    <>
      <span style={size.badge}>L</span>
      {props.stacked ? (
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {title}
          {pair({
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        </span>
      ) : (
        <>
          {title}
          {pair()}
        </>
      )}
    </>
  );
}
