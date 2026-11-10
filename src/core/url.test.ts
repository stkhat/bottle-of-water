import { describe, expect, it } from "vitest";
import {
  fnv1a64,
  normalizeUrl,
  occurrenceLink,
  onHost,
  siteFromInput,
  sourceId,
} from "./url";

describe("normalizeUrl", () => {
  it("drops the hash", () => {
    expect(normalizeUrl("https://example.com/a/b?x=1#section")).toBe(
      "https://example.com/a/b?x=1",
    );
  });

  it("drops tracking parameters and keeps the others in order", () => {
    expect(
      normalizeUrl(
        "https://example.com/post?utm_source=x&id=7&fbclid=a&gclid=b&mc_cid=c&mc_eid=d&ref=e&utm_medium=y&page=2",
      ),
    ).toBe("https://example.com/post?id=7&page=2");
  });

  it("drops the question mark when only tracking parameters were there", () => {
    expect(normalizeUrl("https://example.com/post?utm_source=x")).toBe(
      "https://example.com/post",
    );
  });

  it("keeps the encoding of the parameters it keeps", () => {
    expect(normalizeUrl("https://example.com/s?q=a%20b&utm_term=z")).toBe(
      "https://example.com/s?q=a%20b",
    );
  });

  it("lowercases the host and keeps the path's case", () => {
    expect(normalizeUrl("https://Example.COM/Some/Path")).toBe(
      "https://example.com/Some/Path",
    );
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=42s",
    "https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc&t=10",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share",
  ])("reduces the YouTube URL %s to the watch URL", (url) => {
    expect(normalizeUrl(url)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("leaves other YouTube pages as ordinary URLs", () => {
    expect(normalizeUrl("https://www.youtube.com/@channel/videos#x")).toBe(
      "https://www.youtube.com/@channel/videos",
    );
  });

  it("reduces a Netflix watch URL to its id", () => {
    expect(
      normalizeUrl("https://netflix.com/watch/80100172?trackId=1&tctx=0#x"),
    ).toBe("https://www.netflix.com/watch/80100172");
  });
});

describe("sourceId", () => {
  it("is the same for the same platform and URL", () => {
    expect(sourceId("web", "https://example.com/a")).toBe(
      sourceId("web", "https://example.com/a"),
    );
  });

  it("differs between URLs and between platforms", () => {
    const a = sourceId("web", "https://example.com/a");
    expect(sourceId("web", "https://example.com/b")).not.toBe(a);
    expect(sourceId("youtube", "https://example.com/a")).not.toBe(a);
  });

  it("is the FNV-1a 64-bit hash of platform|url in 16 hex digits", () => {
    expect(sourceId("web", "https://example.com/a")).toBe(
      fnv1a64("web|https://example.com/a"),
    );
  });
});

describe("fnv1a64", () => {
  it.each([
    ["", "cbf29ce484222325"],
    ["a", "af63dc4c8601ec8c"],
    ["foobar", "85944171f73967e8"],
  ])("hashes %j to the reference value", (input, hash) => {
    expect(fnv1a64(input)).toBe(hash);
  });

  it("hashes the UTF-8 bytes", () => {
    expect(fnv1a64("é")).toBe("0ac21707b7181e01");
  });
});

describe("occurrenceLink", () => {
  const video = {
    platform: "youtube" as const,
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };

  it("adds the whole seconds to a YouTube link", () => {
    expect(occurrenceLink(video, { timeMs: 83_900 })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s",
    );
  });

  it("gives the source URL for a quote in an article", () => {
    const article = { platform: "web" as const, url: "https://example.com/a" };
    expect(occurrenceLink(article, { textQuote: "some words" })).toBe(
      "https://example.com/a",
    );
  });

  it("gives the source URL for a Netflix time", () => {
    const show = {
      platform: "netflix" as const,
      url: "https://www.netflix.com/watch/80100172",
    };
    expect(occurrenceLink(show, { timeMs: 5000 })).toBe(
      "https://www.netflix.com/watch/80100172",
    );
  });
});

describe("siteFromInput", () => {
  it.each([
    ["mail.google.com", "mail.google.com"],
    ["  Example.COM ", "example.com"],
    ["https://mail.google.com/mail/u/0/", "mail.google.com"],
    ["news.example.co.uk/today", "news.example.co.uk"],
    ["localhost", "localhost"],
    ["例え.jp", "xn--r8jz45g.jp"],
  ])("reads %j as %s", (input, site) => {
    expect(siteFromInput(input)).toBe(site);
  });

  it.each(["", "   ", "not a site", "example", "-bad-.com", "a..com", "ftp:"])(
    "rejects %j",
    (input) => {
      expect(siteFromInput(input)).toBeUndefined();
    },
  );
});

describe("onHost", () => {
  it.each([
    ["example.com", "example.com", true],
    ["blog.example.com", "example.com", true],
    ["Blog.Example.com", " EXAMPLE.com ", true],
    ["notexample.com", "example.com", false],
    ["example.com", "blog.example.com", false],
    ["example.com", "", false],
  ])("%s on %j is %s", (hostname, entry, expected) => {
    expect(onHost(hostname, entry)).toBe(expected);
  });
});
