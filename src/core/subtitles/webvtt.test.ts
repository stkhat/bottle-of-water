import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWebVtt } from "./webvtt";

const sample = readFileSync(
  new URL("./fixtures/netflix/sample.vtt", import.meta.url),
  "utf8",
);

describe("parseWebVtt", () => {
  it("reads cues with ids and cue settings", () => {
    const cues = parseWebVtt(sample);
    expect(cues[0]).toEqual({
      startMs: 1001,
      endMs: 3503,
      text: "Good morning.\nHow are you?",
    });
  });

  it("skips the header, NOTE and STYLE blocks", () => {
    const cues = parseWebVtt(sample);
    expect(cues.some((c) => /SYNTHETIC|::cue/.test(c.text))).toBe(false);
  });

  it("strips tags and keeps several lines", () => {
    const cues = parseWebVtt(sample);
    expect(cues[1]?.text).toBe("[audience] Good.");
    expect(cues[2]?.text).toBe("It's been great,\nhasn't it?");
  });

  it("reads timestamps without hours", () => {
    expect(parseWebVtt(sample)[2]).toMatchObject({
      startMs: 5405,
      endMs: 8132,
    });
  });

  it("decodes entities and drops inline timestamps", () => {
    expect(parseWebVtt(sample)[3]?.text).toBe("Rock & roll <live> — tonight!");
  });

  it("drops empty cues and ruby readings", () => {
    const cues = parseWebVtt(sample);
    expect(cues).toHaveLength(5);
    expect(cues[4]).toEqual({
      startMs: 3615000,
      endMs: 3617100,
      text: "教育に関心があります",
    });
  });

  it("accepts CRLF line endings and a byte order mark", () => {
    const cues = parseWebVtt(
      "\ufeffWEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nHello\r\nthere\r\n",
    );
    expect(cues).toEqual([
      { startMs: 1000, endMs: 2000, text: "Hello\nthere" },
    ]);
  });

  it("sorts cues by start time", () => {
    const cues = parseWebVtt(
      "WEBVTT\n\n00:05.000 --> 00:06.000\nlate\n\n00:01.000 --> 00:02.000\nearly\n",
    );
    expect(cues.map((c) => c.text)).toEqual(["early", "late"]);
  });

  it("returns no cues for text that is not WebVTT", () => {
    expect(parseWebVtt("")).toEqual([]);
    expect(parseWebVtt("hello\n\nworld")).toEqual([]);
  });
});
