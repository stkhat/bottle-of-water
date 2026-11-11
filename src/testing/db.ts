import { onTestFinished } from "vitest";
import { openLingoDb, type LingoDb } from "../background/db";

/** An empty database of its own, deleted when the test ends. */
export function freshDb(): LingoDb {
  const db = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  onTestFinished(async () => {
    db.close();
    await db.delete();
  });
  return db;
}
