import { onTestFinished } from "vitest";
import { openLangleDb, type LangleDb } from "../background/db";

/** An empty database of its own, deleted when the test ends. */
export function freshDb(): LangleDb {
  const db = openLangleDb(`langle-test-${crypto.randomUUID()}`, {
    // Only an upgrade gives it to rows, and a fresh database has none to upgrade.
    deviceId: () => Promise.resolve("test-device"),
  });
  onTestFinished(async () => {
    db.close();
    await db.delete();
  });
  return db;
}
