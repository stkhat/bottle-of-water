import { describe, expect, it } from "vitest";
import { pushedCommits } from "./pre-push.ts";
import { failureExcerpt, seconds, stripAnsi } from "./verify.ts";

describe("failureExcerpt", () => {
  it("starts at Vitest's failed tests, past the errors passing tests log", () => {
    const log = [
      "> unit: npm test",
      " RUN  v5.1.0",
      "stderr | src/a.browser.test.ts > saves",
      "[DatabaseClosedError: DatabaseClosedError Database has been closed]",
      "    at Collection._read(dexie.js:1764:92)",
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      " FAIL  src/core/words.test.ts > counts words",
      "AssertionError: expected 2 to be 3",
      " Test Files  1 failed | 9 passed (10)",
    ].join("\n");
    expect(failureExcerpt(log)).toBe(
      [
        "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
        " FAIL  src/core/words.test.ts > counts words",
        "AssertionError: expected 2 to be 3",
        " Test Files  1 failed | 9 passed (10)",
      ].join("\n"),
    );
  });

  it("starts at Playwright's first numbered failure", () => {
    const log = [
      "Running 32 tests using 4 workers",
      "Error: page.goto: net::ERR_ABORTED (logged by a passing test)",
      "  1) [chromium] › e2e/popup.spec.ts:12:1 › opens",
      "    Error: expect(locator).toBeVisible() failed",
      "  1 failed",
    ].join("\n");
    expect(failureExcerpt(log).split("\n")[0]).toBe(
      "  1) [chromium] › e2e/popup.spec.ts:12:1 › opens",
    );
  });

  it("falls back to tool errors (tsc, Prettier)", () => {
    const log = ["> tsc --noEmit", "src/a.ts(3,1): error TS2304: x"].join("\n");
    expect(failureExcerpt(log)).toBe("src/a.ts(3,1): error TS2304: x");
  });

  it("shows the end of the log when no line names the failure", () => {
    const log = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const excerpt = failureExcerpt(log, 3);
    expect(excerpt).toBe("line 98\nline 99\nline 100");
  });

  it("keeps at most `max` lines from the first failure", () => {
    const log = ["ok", "Error: one", "a", "b", "c"].join("\n");
    expect(failureExcerpt(log, 2)).toBe("Error: one\na");
  });

  it("reads through colour codes", () => {
    expect(failureExcerpt("\u001b[31m FAIL \u001b[39m src/x.test.ts")).toBe(
      " FAIL  src/x.test.ts",
    );
  });
});

describe("stripAnsi and seconds", () => {
  it("removes colour codes", () => {
    expect(stripAnsi("\u001b[1m\u001b[32m48 passed\u001b[39m\u001b[22m")).toBe(
      "48 passed",
    );
  });
  it("rounds to whole seconds", () => {
    expect(seconds(108_130)).toBe("108s");
  });
});

describe("pushedCommits (pre-push)", () => {
  const sha = (c: string) => c.repeat(40);

  it("asks for the branches a push changes", () => {
    expect(
      pushedCommits(
        `refs/heads/claude/x ${sha("a")} refs/heads/claude/x ${sha("b")}\n`,
      ),
    ).toEqual([{ ref: "claude/x", sha: sha("a") }]);
  });

  it("lets deletions, tags and refs already on the remote through", () => {
    const stdin = [
      `(delete) ${sha("0")} refs/heads/claude/old ${sha("c")}`,
      `refs/tags/v1.0.0 ${sha("d")} refs/tags/v1.0.0 ${sha("0")}`,
      `refs/heads/claude/y ${sha("e")} refs/heads/claude/y ${sha("e")}`,
      "",
    ].join("\n");
    expect(pushedCommits(stdin)).toEqual([]);
  });

  it("asks for a new branch", () => {
    expect(
      pushedCommits(
        `refs/heads/claude/new ${sha("f")} refs/heads/claude/new ${sha("0")}`,
      ),
    ).toEqual([{ ref: "claude/new", sha: sha("f") }]);
  });
});
