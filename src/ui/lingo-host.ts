/** A host of Lingo's own UI (`lingo-article`, `lingo-video`, …), whose UI lives in a shadow root. */
export const isLingoHost = (target: EventTarget): boolean =>
  target instanceof Element && target.localName.startsWith("lingo-");
