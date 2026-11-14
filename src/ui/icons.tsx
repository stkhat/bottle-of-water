import type { ComponentChildren, CSSProperties } from "preact";
import { color } from "./styles";

/** An outline icon in the current text color, 24×24 units scaled to `size`. */
function Outline(props: {
  size: number;
  stroke: number;
  /** `round` caps and joins by default. */
  cap?: boolean;
  join?: boolean;
  color?: string;
  style?: CSSProperties;
  children: ComponentChildren;
}) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.color ?? "currentColor"}
      stroke-width={props.stroke}
      stroke-linecap={props.cap ? "round" : undefined}
      stroke-linejoin={props.join ? "round" : undefined}
      aria-hidden="true"
      style={props.style}
    >
      {props.children}
    </svg>
  );
}

const GEAR_PATH =
  "M19.27 9.78L21.74 9.75L21.74 14.25L19.27 14.22A7.6 7.6 0 0 1 18.71 15.57L20.48 17.3L17.3 20.48L15.57 18.71A7.6 7.6 0 0 1 14.22 19.27L14.25 21.74L9.75 21.74L9.78 19.27A7.6 7.6 0 0 1 8.43 18.71L6.7 20.48L3.52 17.3L5.29 15.57A7.6 7.6 0 0 1 4.73 14.22L2.26 14.25L2.26 9.75L4.73 9.78A7.6 7.6 0 0 1 5.29 8.43L3.52 6.7L6.7 3.52L8.43 5.29A7.6 7.6 0 0 1 9.78 4.73L9.75 2.26L14.25 2.26L14.22 4.73A7.6 7.6 0 0 1 15.57 5.29L17.3 3.52L20.48 6.7L18.71 8.43A7.6 7.6 0 0 1 19.27 9.78Z";

/** Every "open settings" control. */
export function GearIcon(props: { size: number }) {
  return (
    <Outline size={props.size} stroke={1.6} join>
      <path d={GEAR_PATH}></path>
      <circle cx="12" cy="12" r="3.2"></circle>
    </Outline>
  );
}

export function WordListIcon(props: { size: number }) {
  return (
    <Outline size={props.size} stroke={1.6} cap>
      <path d="M9 6.5h11M9 12h11M9 17.5h11"></path>
      <circle cx="4.75" cy="6.5" r="1" fill="currentColor"></circle>
      <circle cx="4.75" cy="12" r="1" fill="currentColor"></circle>
      <circle cx="4.75" cy="17.5" r="1" fill="currentColor"></circle>
    </Outline>
  );
}

export function CheckIcon() {
  return (
    <Outline
      size={16}
      stroke={2}
      cap
      join
      color={color.green}
      style={{ flex: "none" }}
    >
      <path d="M5 12l5 5 9-10"></path>
    </Outline>
  );
}

export function CloseIcon(props: { size: number; stroke: number }) {
  return (
    <Outline size={props.size} stroke={props.stroke} cap>
      <path d="M6 6l12 12M18 6L6 18"></path>
    </Outline>
  );
}

export function SpeakerIcon() {
  return (
    <Outline size={20} stroke={1.8} join>
      <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
      <path d="M16 9a4 4 0 0 1 0 6"></path>
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"></path>
    </Outline>
  );
}

export function SearchIcon() {
  return (
    <Outline size={18} stroke={1.8} cap>
      <circle cx="11" cy="11" r="6"></circle>
      <path d="M20 20l-4.5-4.5"></path>
    </Outline>
  );
}

/** The ^ of the Lingo menu button. */
export function ChevronUpIcon() {
  return (
    <Outline size={16} stroke={2.2} cap join>
      <path d="M6 15l6-6 6 6"></path>
    </Outline>
  );
}

export function PlayIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 5l12 7-12 7z"></path>
    </svg>
  );
}

/** The dictionary window's drag handle: two columns of three dots. */
export function GripIcon() {
  return (
    <svg
      width="14"
      height="18"
      viewBox="0 0 14 18"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="1.5"></circle>
      <circle cx="10" cy="4" r="1.5"></circle>
      <circle cx="4" cy="9" r="1.5"></circle>
      <circle cx="10" cy="9" r="1.5"></circle>
      <circle cx="4" cy="14" r="1.5"></circle>
      <circle cx="10" cy="14" r="1.5"></circle>
    </svg>
  );
}

/** A source's kind (a video or a page), named for screen readers. */
export function SourceIcon(props: { video: boolean; label: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
      role="img"
      aria-label={props.label}
    >
      {props.video ? (
        <>
          <rect x="3" y="6" width="13" height="12" rx="2"></rect>
          <path d="M16 10l5-3v10l-5-3z"></path>
        </>
      ) : (
        <>
          <path d="M6 3h9l4 4v14H6z"></path>
          <path d="M9 12h7M9 16h7M9 8h3"></path>
        </>
      )}
    </svg>
  );
}
