export type Platform = "youtube" | "netflix" | "web";

/** Where in a source a term was seen: a playback time or a quote from the text. */
export type Position = { timeMs: number } | { textQuote: string };

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref"]);

const isTrackingParam = (name: string) =>
  name.startsWith("utm_") || TRACKING_PARAMS.has(name);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const NETFLIX_HOSTS = new Set(["netflix.com", "www.netflix.com"]);

function youtubeVideoId(url: URL): string | undefined {
  if (url.hostname === "youtu.be")
    return url.pathname.split("/")[1] || undefined;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return undefined;
  if (url.pathname === "/watch") return url.searchParams.get("v") || undefined;
  const shorts = /^\/shorts\/([^/]+)/.exec(url.pathname);
  return shorts?.[1];
}

/**
 * The URL a source is stored under, so the same page or video gets one source.
 *
 * - YouTube videos (watch, youtu.be, m., shorts) → `https://www.youtube.com/watch?v=<id>`
 * - Netflix `watch/<id>` → `https://www.netflix.com/watch/<id>`
 * - Anything else: the hash and tracking parameters (`utm_*`, `fbclid`, `gclid`,
 *   `mc_cid`, `mc_eid`, `ref`) are dropped; the host is lowercased; the path and the
 *   other parameters stay exactly as they were.
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input);

  const video = youtubeVideoId(url);
  if (video) return `https://www.youtube.com/watch?v=${video}`;

  const netflix = NETFLIX_HOSTS.has(url.hostname)
    ? /^\/watch\/(\d+)/.exec(url.pathname)
    : null;
  if (netflix) return `https://www.netflix.com/watch/${netflix[1]}`;

  url.hash = "";
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((part) => {
      if (part === "") return false;
      const name = part.split("=", 1)[0]!;
      let decoded = name;
      try {
        decoded = decodeURIComponent(name.replaceAll("+", " "));
      } catch {
        // Keep the raw name when it is not valid percent-encoding.
      }
      return !isTrackingParam(decoded);
    });
  url.search = kept.length > 0 ? `?${kept.join("&")}` : "";
  return url.href;
}

/** FNV-1a 64-bit hash of the UTF-8 bytes of `text`, as 16 hex digits. */
export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

/** The id of the source for a platform and an already normalized URL. */
export function sourceId(platform: Platform, normalizedUrl: string): string {
  return fnv1a64(`${platform}|${normalizedUrl}`);
}

/** A link back to the spot: YouTube times become `&t=<seconds>s`; otherwise the source URL. */
export function occurrenceLink(
  source: { platform: Platform; url: string },
  pos: Position,
): string {
  if (source.platform === "youtube" && "timeMs" in pos)
    return `${source.url}&t=${Math.floor(pos.timeMs / 1000)}s`;
  return source.url;
}

/** True when `hostname` is `entry` or one of its subdomains, ignoring case. */
export function onHost(hostname: string, entry: string): boolean {
  const host = hostname.toLowerCase();
  const site = entry.trim().toLowerCase();
  return site !== "" && (host === site || host.endsWith(`.${site}`));
}

const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

/**
 * The host a user typed for "Never run on": a host name or a URL, case and spaces
 * ignored. Undefined when it is not a host with at least one dot (or `localhost`).
 */
export function siteFromInput(input: string): string | undefined {
  const text = input.trim().toLowerCase();
  if (text === "") return undefined;
  let hostname: string;
  try {
    hostname = new URL(text.includes("://") ? text : `https://${text}`)
      .hostname;
  } catch {
    return undefined;
  }
  return hostname === "localhost" || HOSTNAME.test(hostname)
    ? hostname
    : undefined;
}
