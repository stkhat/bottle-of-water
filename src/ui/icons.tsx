/** The 8-tooth gear outline every "open settings" control uses. */
export const GEAR_PATH =
  "M19.27 9.78L21.74 9.75L21.74 14.25L19.27 14.22A7.6 7.6 0 0 1 18.71 15.57L20.48 17.3L17.3 20.48L15.57 18.71A7.6 7.6 0 0 1 14.22 19.27L14.25 21.74L9.75 21.74L9.78 19.27A7.6 7.6 0 0 1 8.43 18.71L6.7 20.48L3.52 17.3L5.29 15.57A7.6 7.6 0 0 1 4.73 14.22L2.26 14.25L2.26 9.75L4.73 9.78A7.6 7.6 0 0 1 5.29 8.43L3.52 6.7L6.7 3.52L8.43 5.29A7.6 7.6 0 0 1 9.78 4.73L9.75 2.26L14.25 2.26L14.22 4.73A7.6 7.6 0 0 1 15.57 5.29L17.3 3.52L20.48 6.7L18.71 8.43A7.6 7.6 0 0 1 19.27 9.78Z";

/** Settings: a gear drawn in the current text color. */
export function GearIcon(props: { size: number }) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={GEAR_PATH}></path>
      <circle cx="12" cy="12" r="3.2"></circle>
    </svg>
  );
}

/** The word list: three bulleted lines drawn in the current text color. */
export function WordListIcon(props: { size: number }) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M9 6.5h11M9 12h11M9 17.5h11"></path>
      <circle cx="4.75" cy="6.5" r="1" fill="currentColor"></circle>
      <circle cx="4.75" cy="12" r="1" fill="currentColor"></circle>
      <circle cx="4.75" cy="17.5" r="1" fill="currentColor"></circle>
    </svg>
  );
}
