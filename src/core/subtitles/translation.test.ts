import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sentenceCards } from "./cues";
import { alignByOverlap, chooseTranslation } from "./translation";
import { parseTtml } from "./ttml";
import type { Cue, Track } from "./types";
import { parseYouTubeJson3, youtubeCaptionInfo } from "./youtube-json3";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), "utf8");

const track = (
  id: string,
  lang: string,
  kind: Track["kind"] = "manual",
): Track => ({
  id,
  lang,
  kind,
  label: id,
});

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

describe("chooseTranslation", () => {
  const base = {
    nativeLang: "ja",
    canAutoTranslate: true,
    translatorAvailable: true,
  };

  it("prefers the site's manual track in the native language", () => {
    const { tracks } = youtubeCaptionInfo(
      JSON.parse(fixture("captionTracks.json")),
    );
    const choice = chooseTranslation({ ...base, tracks });
    expect(choice.source).toBe("siteTrack");
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".ja");
  });

  it("matches the native language by its primary subtag", () => {
    const choice = chooseTranslation({
      ...base,
      tracks: [track(".en", "en"), track(".ja-JP", "ja-JP")],
    });
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".ja-JP");
  });

  it("prefers an exact language match over a primary-subtag match", () => {
    const choice = chooseTranslation({
      ...base,
      nativeLang: "pt-BR",
      tracks: [track(".pt-PT", "pt-PT"), track(".pt-BR", "pt-br")],
    });
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".pt-BR");
  });

  it("does not count an auto-generated native track as a translation", () => {
    const choice = chooseTranslation({
      ...base,
      tracks: [track(".en", "en"), track("a.ja", "ja", "asr")],
    });
    expect(choice).toEqual({ source: "siteAutoTranslate" });
  });

  it("uses the site's auto-translation when there is no native track", () => {
    expect(
      chooseTranslation({ ...base, tracks: [track(".en", "en")] }),
    ).toEqual({ source: "siteAutoTranslate" });
  });

  it("falls back to the built-in translator", () => {
    expect(
      chooseTranslation({
        ...base,
        canAutoTranslate: false,
        tracks: [track(".en", "en")],
      }),
    ).toEqual({ source: "builtIn" });
  });

  it("chooses no translation when nothing is available", () => {
    expect(
      chooseTranslation({
        nativeLang: "ja",
        canAutoTranslate: false,
        translatorAvailable: false,
        tracks: [],
      }),
    ).toEqual({ source: "none" });
  });
});

describe("alignByOverlap", () => {
  const en = parseYouTubeJson3(fixture("en.json3"));

  describe("with a native track that has its own timing", () => {
    const ja = parseYouTubeJson3(fixture("ja.json3"));
    const aligned = alignByOverlap(en, ja, { lang: "ja" });

    it("returns one entry per original cue", () => {
      expect(aligned).toHaveLength(en.length);
    });

    it("gives each translated cue to the original cue it overlaps most", () => {
      // ja 25000–32000 overlaps en[0] by 2575 ms, en[1] by 1403 ms, en[2] by 871 ms
      expect(aligned[0]).toBe(
        "おはようございます。気分はいかがですか？素晴らしいですね、ここは",
      );
      expect(aligned[1]).toBe("");
      expect(aligned[3]).toBe("すべてが驚嘆の連続です");
    });

    it("joins several translated cues without spaces for Japanese", () => {
      // ja 40000–44000 overlaps en[5] (37269–41175) by 1175 ms and en[6] by 904 ms,
      // but en[5] is "(Laughter)", so en[6] (43096–46663) gets it and ja 44000–48000
      expect(aligned[5]).toBe("");
      expect(aligned[6]).toBe(
        "カンファレンスを通して、これまで私たちは３つのテーマを取り上げてきました",
      );
      // en[8] 48997–53467 overlaps ja 48000–50000 (1003 ms, more than en[7]'s 973 ms)
      // and ja 50000–54000 (3467 ms)
      expect(aligned[8]).toBe(
        "どれも私が話したいことに関わっています１つ目は人間の創造性について",
      );
    });

    it("drops translated cues that overlap no original cue", () => {
      expect(aligned.join("")).not.toContain("翻訳");
    });
  });

  describe("with the site's auto-translation (same timing as the original)", () => {
    const tlang = parseYouTubeJson3(fixture("en-tlang-ja.json3"));
    const aligned = alignByOverlap(en, tlang, { lang: "ja" });

    it("maps cues one to one and flattens line breaks", () => {
      expect(aligned[0]).toBe("おはよう。 元気ですか？");
      expect(aligned[6]).toBe("会議には、");
      expect(aligned[17]).toBe(
        "実際、私が気づいたのは、誰もが教育に興味を持っているということです。 そうでしょう",
      );
      expect(aligned[18]).toBe("？");
    });

    it("leaves a line empty when its translation was empty", () => {
      expect(en[13]?.startMs).toBe(63325);
      expect(aligned[13]).toBe("");
    });
  });

  it("joins with a space for languages written with spaces", () => {
    const aligned = alignByOverlap(
      [cue(0, 4000, "Hola, ¿qué tal? Bien.")],
      [cue(0, 2000, "Hello,\nhow are you?"), cue(2000, 4000, "Fine.")],
      { lang: "en" },
    );
    expect(aligned).toEqual(["Hello, how are you? Fine."]);
  });

  it("gives a tie to the earlier original cue", () => {
    const aligned = alignByOverlap(
      [cue(0, 2000, "a"), cue(2000, 4000, "b")],
      [cue(1000, 3000, "x")],
      { lang: "en" },
    );
    expect(aligned).toEqual(["x", ""]);
  });

  it("handles empty inputs", () => {
    expect(alignByOverlap([], [cue(0, 1, "x")], { lang: "en" })).toEqual([]);
    expect(alignByOverlap([cue(0, 1, "a")], [], { lang: "en" })).toEqual([""]);
  });
});

describe("alignByOverlap on sentence cards", () => {
  const flat = (text: string) => text.replaceAll("\n", " ");

  it("gives a line that covers two cues to their sentence, not to half of it", () => {
    const { cards } = sentenceCards([
      cue(1000, 3000, "DID YOU EVEN INTERVIEW THIS WOMAN"),
      cue(3100, 5000, "BEFORE YOU ASKED HER TO MOVE IN?"),
      cue(5200, 6000, "I DIDN'T KNOW THAT, EITHER."),
    ]);
    expect(
      alignByOverlap(
        cards,
        [
          cue(1500, 4800, "同居させる前に面接した？"),
          cue(5100, 6000, "初耳だよ"),
        ],
        { lang: "ja" },
      ),
    ).toEqual(["同居させる前に面接した？", "初耳だよ"]);
  });

  it("gives a spoken line to a sentence it overlaps rather than to a sound label", () => {
    const { cards } = sentenceCards([
      cue(0, 2000, "If you work in education,"),
      cue(2000, 3000, "you're not asked."),
      cue(3000, 6000, "(Laughter)"),
      cue(6000, 8000, "[DOOR CLOSES]"),
    ]);
    expect(
      alignByOverlap(
        cards,
        [
          cue(2500, 5500, "誘われませんよね"),
          cue(6000, 8000, "（ドアが閉まる）"),
        ],
        { lang: "ja" },
      ),
    ).toEqual(["誘われませんよね", "", "（ドアが閉まる）"]);
  });

  it("matches the YouTube fixtures' Japanese lines to the English sentences", () => {
    const { cards } = sentenceCards(parseYouTubeJson3(fixture("en.json3")));
    const ja = parseYouTubeJson3(fixture("ja.json3"));
    const aligned = alignByOverlap(cards, ja, { lang: "ja" });
    const of = (start: string) =>
      aligned[cards.findIndex((c) => flat(c.text).startsWith(start))];
    expect(of("In fact, I'm leaving.")).toBe(
      "だからそろそろ帰ろうかと思って（笑）",
    );
    expect(of("There have been three themes")).toBe(
      "カンファレンスを通して、これまで私たちは３つのテーマを取り上げてきました",
    );
    expect(of("If you're at a dinner party")).toBe(
      "例えばディナーパーティーの席であなたが教育関係の仕事をしてると言ったとします" +
        "まあ実のところ、教育関係で働いている人はあまりディナーパーティーに行ったりしません",
    );
    expect(of("If you work in education")).toBe("そんなに誘われませんよね");
    // The laughter gets no spoken line.
    cards.forEach((card, i) => {
      if (card.text === "(Laughter)") expect(aligned[i]).toBe("");
    });
  });

  it("matches the Netflix fixtures' Japanese lines to the closed captions' sentences", () => {
    const read = (name: string) =>
      parseTtml(
        readFileSync(
          new URL(`./fixtures/netflix/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const { cards } = sentenceCards(read("en.imsc.ttml"));
    const aligned = alignByOverlap(cards, read("ja.imsc.ttml"), {
      lang: "ja",
    });
    const of = (start: string) =>
      aligned[cards.findIndex((c) => flat(c.text).startsWith(start))];
    expect(of("IF YOU ARE NOT PREPARED")).toBe(
      "間違う覚悟がなければ独創的なものは生まれません",
    );
    expect(of("[AUDIENCE APPLAUDS]")).toBe("（拍手）");
  });
});
