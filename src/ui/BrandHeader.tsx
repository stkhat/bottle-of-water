import { LangleMark } from "./LangleMark";
import { color } from "./styles";

const SIZES = {
  popup: { mark: 28, title: "15px", pair: "13px" },
  settings: { mark: 32, title: "18px", pair: "14px" },
  page: { mark: 32, title: "22px", pair: "14px" },
};

/**
 * Langle's mark, the page's title and the language pair, for the caller's flex row.
 * `stacked` puts the pair under the title (the popup, whose header also holds its
 * buttons and the Langle switch); a pair too long for the room left ends in "…".
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
      <LangleMark size={size.mark} />
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
