import { hostnameOf, type Platform } from "../../core/url";
import { t, type MessageKey } from "../../i18n/t";
import type { OccurrenceView } from "../../messaging/protocol";
import { formatTime, shortDate } from "../format/format";
import type { ElsewhereItem } from "./ElsewhereRow";

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
