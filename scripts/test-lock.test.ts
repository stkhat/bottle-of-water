import { describe, expect, test } from "vitest";
import { held } from "./test-lock.ts";

describe("held (test lock)", () => {
  const alive = (pid: number) => pid === 42;

  test("a lock whose holder runs is held", () => {
    expect(held("42 /repo/.claude/worktrees/a\n", alive)).toBe(true);
  });

  test("a lock whose holder is gone is free", () => {
    expect(held("7 /repo\n", alive)).toBe(false);
  });

  test("a lock being written counts as held; an unreadable one is free", () => {
    expect(held("", alive)).toBe(true);
    expect(held("not a pid\n", alive)).toBe(false);
  });
});
