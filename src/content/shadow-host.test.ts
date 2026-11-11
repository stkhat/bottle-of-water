import { describe, expect, it } from "vitest";
import { shadowRootMode } from "./shadow-host";

describe("shadowRootMode", () => {
  it("closes Lingo's shadow roots in production builds", () => {
    expect(shadowRootMode("production")).toBe("closed");
  });

  it("keeps them open in the check build, in development and in tests", () => {
    expect(shadowRootMode("check")).toBe("open");
    expect(shadowRootMode("development")).toBe("open");
    expect(shadowRootMode("test")).toBe("open");
  });

  it("follows the build's mode by default", () => {
    expect(shadowRootMode()).toBe(
      import.meta.env.MODE === "production" ? "closed" : "open",
    );
  });
});
