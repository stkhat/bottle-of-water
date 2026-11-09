import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTtml } from "./ttml";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/netflix/${name}`, import.meta.url), "utf8");
const sample = fixture("sample.ttml");
const enDfxp = fixture("en.dfxp");
const enImsc = fixture("en.imsc.ttml");
const jaImsc = fixture("ja.imsc.ttml");

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

  it("joins paragraphs with the same times into one cue, lines top to bottom", () => {
    const cues = parseTtml(enDfxp);
    expect(cues).toHaveLength(10);
    expect(cues[0]).toEqual({
      startMs: 1000,
      endMs: 4000,
      text: "GOOD EVENING,\nAND WELCOME BACK TO THE WORKSHOP.",
    });
    // The lower line comes first in the file.
    expect(cues[3]?.text).toBe("WE SHOULD NURTURE IT,\nNOT STIFLE IT.");
    // Capital letters are kept.
    expect(cues[2]?.text).toBe("EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.");
  });

  it("orders lines at the same height left to right", () => {
    expect(parseTtml(enDfxp)[9]?.text).toBe("THANK YOU.\nBRAVO!");
  });

  it("places paragraphs by their region's origin when they have none", () => {
    expect(parseTtml(enImsc)[9]?.text).toBe("THANK YOU.\nBRAVO!");
    const withRegions = (body: string) =>
      tt(body).replace(
        "<body>",
        '<head><layout><region xml:id="high" tts:origin="10% 70%"/><region xml:id="low" tts:origin="10% 80%"/></layout></head><body>',
      );
    const low = '<p begin="1s" end="2s" region="low">b</p>';
    const high = '<p begin="1s" end="2s" region="high">a</p>';
    expect(parseTtml(withRegions(low + high))[0]?.text).toBe("a\nb");
    // Without a place for every line, they stay in the file's order.
    const nowhere = '<p begin="1s" end="2s">c</p>';
    expect(parseTtml(withRegions(low + high + nowhere))).toEqual([
      { startMs: 1000, endMs: 2000, text: "b\na\nc" },
    ]);
  });

  it("ignores comments", () => {
    expect(
      parseTtml(
        tt(
          '<!-- <p begin="0s" end="1s">old</p> --><p begin="1s" end="2s">new</p>',
        ),
      ),
    ).toEqual([{ startMs: 1000, endMs: 2000, text: "new" }]);
  });

  it("reads the same cues from the English DFXP and IMSC tracks", () => {
    expect(parseTtml(enImsc)).toEqual(parseTtml(enDfxp));
  });

  it("drops ruby readings declared on styles", () => {
    const cues = parseTtml(jaImsc);
    expect(cues[0]?.text).toBe(
      "こんばんは ワークショップへようこそ\n今夜のテーマは教室での創造性です",
    );
    expect(cues[1]?.text).toBe("子どもは皆 驚くべき想像力を持っています");
  });

  it("reads vertical and sheared lines as text", () => {
    const cues = parseTtml(jaImsc);
    expect(cues).toHaveLength(8);
    expect(cues[3]).toEqual({ startMs: 16380, endMs: 20000, text: "（拍手）" });
    expect(cues[4]?.text).toBe("間違いは学びの一部です");
  });

  it("keeps line breaks in the text under xml:space preserve", () => {
    expect(
      parseTtml(
        tt(
          '<p begin="1s" end="2s" xml:space="preserve">one  two\nthree <span>four</span></p><p begin="3s" end="4s">five\nsix</p>',
        ),
      ).map((c) => c.text),
    ).toEqual(["one two\nthree four", "five six"]);
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
