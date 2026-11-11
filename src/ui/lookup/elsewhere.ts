import { hostnameOf, type Platform } from "../../core/url";
import { t, type MessageKey } from "../../i18n/t";
import type { OccurrenceView } from "../../messaging/protocol";
import { shortDate } from "../format/format";
import type { ElsewhereItem } from "./DictionaryWindow";

/** A playback time as m:ss, or h:mm:ss from an hour on. */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const SITE = {
  youtube: "platform.youtube",
  netflix: "platform.netflix",
} as const satisfies Record<Exclude<Platform, "web">, MessageKey>;

const hostOf = (url: string) => hostnameOf(url)?.replace(/^www\./, "") ?? url;

/**
 * An occurrence as a "Seen elsewhere" row: the source, where in it (site and time, or
 * the host), and the sentence.
 */
export function occurrenceItem(o: OccurrenceView): ElsewhereItem {
  const { platform, title, url } = o.source;
  let meta = hostOf(url);
  if (platform !== "web") {
    const site = t(SITE[platform]);
    meta =
      "timeMs" in o.pos
        ? t("dict.meta.at", { site, time: formatTime(o.pos.timeMs) })
        : site;
  }
  return {
    title: title || url,
    meta,
    text: o.sentence,
    href: o.link,
    video: platform !== "web",
  };
}

/** The dictionary window's "Seen elsewhere" rows, each with the day it was seen. */
export function elsewhereItems(
  views: readonly OccurrenceView[],
  now: number,
): ElsewhereItem[] {
  return views.map((o) => {
    const item = occurrenceItem(o);
    return {
      ...item,
      meta: t("dict.meta.date", {
        meta: item.meta,
        date: shortDate(o.seenAt, now),
      }),
    };
  });
}
