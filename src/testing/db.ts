import { onTestFinished } from "vitest";
import { openLangleDb, type LangleDb } from "../background/db";

/** An empty database of its own, deleted when the test ends. */
export function freshDb(): LangleDb {
  const db = openLangleDb(`langle-test-${crypto.randomUUID()}`);
  onTestFinished(async () => {
    db.close();
    await db.delete();
  });
  return db;
}
