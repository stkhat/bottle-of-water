import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import { interpolate, t } from "./t";

describe("t", () => {
  it("returns the en.json value for a key", () => {
    expect(t("app.name")).toBe(en["app.name"]);
    expect(t("app.name")).toBe("Lingo");
  });

  it("accepts vars for keys without placeholders", () => {
    expect(t("app.name", { unused: 1 })).toBe("Lingo");
  });

  it("rejects unknown keys at type level", () => {
    // @ts-expect-error unknown key must be a TypeScript error
    const value = t("no.such.key");
    expect(value).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("interpolates one var", () => {
    expect(interpolate("Hello, {name}!", { name: "Ann" })).toBe("Hello, Ann!");
  });

  it("interpolates several vars, including numbers and repeats", () => {
    expect(interpolate("{a} and {b}, {a}", { a: "x", b: 3 })).toBe(
      "x and 3, x",
    );
  });

  it("leaves a placeholder literal when its var is not given", () => {
    expect(interpolate("Hello, {name}!")).toBe("Hello, {name}!");
    expect(interpolate("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });
});
