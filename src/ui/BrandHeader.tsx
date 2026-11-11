import { badge, color } from "./styles";

const SIZES = {
  popup: { badge: badge(28, 8, 14), title: "15px", pair: "13px" },
  settings: { badge: badge(32, 9, 16), title: "18px", pair: "14px" },
  page: { badge: badge(32, 9, 16), title: "22px", pair: "14px" },
};

/** The "L" badge, the page's title and the language pair, for the caller's flex row. */
export function BrandHeader(props: {
  size: keyof typeof SIZES;
  title: string;
  /** "English → Japanese". */
  pair?: string;
  /** The title is the page's `<h1>`. */
  heading?: boolean;
}) {
  const size = SIZES[props.size];
  const Title = props.heading ? "h1" : "span";
  return (
    <>
      <span style={size.badge}>L</span>
      <Title style={{ margin: 0, fontSize: size.title, fontWeight: 700 }}>
        {props.title}
      </Title>
      {props.pair !== undefined && (
        <span style={{ fontSize: size.pair, color: color.muted }}>
          {props.pair}
        </span>
      )}
    </>
  );
}
