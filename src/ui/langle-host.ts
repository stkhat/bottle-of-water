/** A host of Langle's own UI (`langle-article`, `langle-video`, …), whose UI lives in a shadow root. */
export const isLangleHost = (target: EventTarget): boolean =>
  target instanceof Element && target.localName.startsWith("langle-");
