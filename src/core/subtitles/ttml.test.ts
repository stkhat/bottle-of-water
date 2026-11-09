import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTtml } from "./ttml";

const sample = readFileSync(
  new URL("./fixtures/netflix/sample.ttml", import.meta.url),
  "utf8",
);

const tt = (body: string, attrs = "") =>
  `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ${attrs}><body><div>${body}</div></body></tt>`;

describe("parseTtml", () => {
  it("reads tick times with the document's tick rate", () => {
    const cues = parseTtml(sample);
    expect(cues[0]).toEqual({
      startMs: 1001,
      endMs: 3503,
      text: "Good morning.\nHow are you?",
    });
  });

  it("strips nested spans and keeps <br/> as a line break", () => {
    const cues = parseTtml(sample);
    expect(cues[1]?.text).toBe("[audience] Good.");
    expect(cues[2]?.text).toBe("It's been great,\nhasn't it?");
  });

  it("decodes entities", () => {
    expect(parseTtml(sample)[3]?.text).toBe("Rock & roll <live> — tonight!");
  });

  it("drops empty paragraphs and collapses source whitespace", () => {
    const cues = parseTtml(sample);
    expect(cues).toHaveLength(6);
    expect(cues[4]).toEqual({
      startMs: 12000,
      endMs: 14100,
      text: "I find this very interesting.",
    });
  });

  it("drops ruby readings and keeps the base text", () => {
    expect(parseTtml(sample)[5]?.text).toBe("教育に関心があります");
  });

  it("reads clock times with fractions and frames", () => {
    const cues = parseTtml(
      tt(
        '<p begin="00:00:01.5" end="00:00:02.250">a</p><p begin="01:02:03:12" end="01:02:04:00">b</p>',
        'ttp:frameRate="24"',
      ),
    );
    expect(cues[0]).toMatchObject({ startMs: 1500, endMs: 2250 });
    expect(cues[1]).toMatchObject({ startMs: 3723500, endMs: 3724000 });
  });

  it("reads offset times in h, m, s, ms, f and t", () => {
    const cues = parseTtml(
      tt(
        '<p begin="1.5s" end="2000ms">a</p><p begin="0.5m" end="0.01h">b</p><p begin="30f" end="90f">c</p><p begin="5t" end="10t">d</p>',
      ),
    );
    // No tickRate and no frameRate: 1 tick per second, 30 frames per second
    expect(cues.map((c) => [c.text, c.startMs, c.endMs])).toEqual([
      ["c", 1000, 3000],
      ["a", 1500, 2000],
      ["d", 5000, 10000],
      ["b", 30000, 36000],
    ]);
  });

  it("uses dur when there is no end", () => {
    const cues = parseTtml(tt('<p begin="2s" dur="1.5s">a</p>'));
    expect(cues[0]).toMatchObject({ startMs: 2000, endMs: 3500 });
  });

  it("sorts cues by start time and skips paragraphs without times", () => {
    const cues = parseTtml(
      tt(
        '<p begin="5s" end="6s">late</p><p>no time</p><p begin="1s" end="2s">early</p>',
      ),
    );
    expect(cues.map((c) => c.text)).toEqual(["early", "late"]);
  });

  it("returns no cues for an empty or broken document", () => {
    expect(parseTtml("")).toEqual([]);
    expect(parseTtml("<tt><body><div><p begin=")).toEqual([]);
  });
});
