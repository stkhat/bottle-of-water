/**
 * How Langle's mark turns gray while Langle is off: gray, a little lighter and flatter, so
 * it reads on light and dark backgrounds alike. The toolbar's off icons are rendered with
 * it (`scripts/make-icons.ts`), and `LangleMark` applies it to the inline mark.
 */
export const OFF_FILTER = "grayscale(1) brightness(1.15) contrast(0.85)";
