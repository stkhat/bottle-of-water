import { describe, expect, it } from "vitest";
import { backupFileName, kilobytes, relativeTime } from "./format";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it.each([
    [0, "just now"],
    [59 * SECOND, "just now"],
    [2 * MINUTE + 30 * SECOND, "2 minutes ago"],
    [1 * MINUTE, "1 minute ago"],
    [3 * HOUR, "3 hours ago"],
    [1 * DAY + HOUR, "yesterday"],
    [12 * DAY, "12 days ago"],
    [45 * DAY, "last month"],
    [400 * DAY, "last year"],
  ])("%i ms ago is %s", (ago, text) => {
    expect(relativeTime(NOW - ago, NOW)).toBe(text);
  });

  it("calls a time slightly in the future (another device's clock) just now", () => {
    expect(relativeTime(NOW + 30 * SECOND, NOW)).toBe("just now");
  });
});

describe("kilobytes", () => {
  it("rounds bytes to whole KB of 1,024 bytes", () => {
    expect(kilobytes(102_400)).toBe(100);
    expect(kilobytes(41 * 1024 + 300)).toBe(41);
    expect(kilobytes(0)).toBe(0);
  });

  it("shows any data as at least 1 KB", () => {
    expect(kilobytes(120)).toBe(1);
  });
});

describe("backupFileName", () => {
  it("names the file after the local date", () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe(
      "lingo-backup-2026-01-05.json",
    );
  });
});
