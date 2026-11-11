import type { SourceInput } from "../messaging/protocol";

export const ARTICLE: SourceInput = {
  platform: "web",
  url: "https://example.com/bread",
  title: "Bread",
  lang: "en",
};

export const VIDEO: SourceInput = {
  platform: "youtube",
  url: "https://youtu.be/dQw4w9WgXcQ?si=share",
  title: "A video",
  lang: "en",
};
