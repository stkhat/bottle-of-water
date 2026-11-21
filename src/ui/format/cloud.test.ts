import { describe, expect, it } from "vitest";
import { cloudConnectedDesc } from "./cloud";

describe("cloudConnectedDesc", () => {
  it("names the account once it is known", () => {
    expect(
      cloudConnectedDesc({ account: "alex.kim@gmail.com" }, "Google Drive"),
    ).toBe(
      "Google Drive (alex.kim@gmail.com). Everything is saved there, in a folder only Langle can open.",
    );
  });

  it("names the provider alone until then", () => {
    expect(cloudConnectedDesc({}, "Google Drive")).toBe(
      "Google Drive. Everything is saved there, in a folder only Langle can open.",
    );
  });
});
