import { describe, expect, it } from "vitest";
import { cardHref } from "./sponsors";

describe("cardHref", () => {
  it("tags a sponsor's link with utm_source=langle, keeping its own parameters", () => {
    expect(
      cardHref({
        type: "sponsor",
        name: "Acme",
        line: "Lessons",
        url: "https://acme.example/learn?ref=a#top",
      }),
    ).toBe("https://acme.example/learn?ref=a&utm_source=langle#top");
  });

  it("leaves an affiliate link as the program gave it", () => {
    const url = "https://tutors.example/?aff=123&utm_source=program";
    expect(cardHref({ type: "affiliate", name: "T", line: "L", url })).toBe(
      url,
    );
  });
});
