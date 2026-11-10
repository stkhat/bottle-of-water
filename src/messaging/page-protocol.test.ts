import { describe, expect, it } from "vitest";
import { isPageRequest } from "./page-protocol";

describe("isPageRequest", () => {
  it("accepts the page summary request", () => {
    expect(isPageRequest({ type: "pageSummary" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isPageRequest(undefined)).toBe(false);
    expect(isPageRequest("pageSummary")).toBe(false);
    expect(isPageRequest({ type: "lookup" })).toBe(false);
    expect(isPageRequest({ type: "pageSaveAll", status: "known" })).toBe(false);
    expect(isPageRequest({ type: "pageUndo" })).toBe(false);
  });
});
