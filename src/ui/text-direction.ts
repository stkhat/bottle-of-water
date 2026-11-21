// The direction of text in another language than the UI's (English, left to right).
import { writtenRightToLeft } from "../core/natives";

/**
 * The `lang` and `dir` attributes of an element that holds text in `lang`: a language
 * written right to left (`NativeLanguage.rtl`: Arabic) gets dir="rtl". An element with
 * `dir` is a bidi isolate (the HTML user-agent style, `[dir] { unicode-bidi: isolate }`),
 * so the text runs right to left inside the English UI: its punctuation, numbers and
 * Latin labels keep their places, nothing around it is reordered, and an ellipsis that
 * cuts it stands at its end, on the left. The element itself stays where the layout
 * puts it.
 */
export function langAttrs(lang: string | undefined): {
  lang: string | undefined;
  dir?: "rtl";
} {
  return lang !== undefined && writtenRightToLeft(lang)
    ? { lang, dir: "rtl" }
    : { lang };
}
