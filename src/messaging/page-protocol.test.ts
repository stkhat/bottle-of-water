import { describe, expect, it } from "vitest";
import { isPageRequest } from "./page-protocol";

describe("isPageRequest", () => {
  it("accepts the page requests", () => {
    expect(isPageRequest({ type: "pageSummary" })).toBe(true);
    expect(isPageRequest({ type: "pageSaveAll", status: "learning" })).toBe(
      true,
    );
    expect(isPageRequest({ type: "pageSaveAll", status: "known" })).toBe(true);
    expect(isPageRequest({ type: "pageUndo" })).toBe(true);
    expect(isPageRequest({ type: "pageShowWords" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isPageRequest(undefined)).toBe(false);
    expect(isPageRequest("pageSummary")).toBe(false);
    expect(isPageRequest({ type: "lookup" })).toBe(false);
    expect(isPageRequest({ type: "pageSaveAll" })).toBe(false);
    expect(isPageRequest({ type: "pageSaveAll", status: "new" })).toBe(false);
  });
});
