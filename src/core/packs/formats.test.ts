import { describe, expect, it } from "vitest";
import { PACK_FORMATS } from "./formats";
import lockFile from "./packs.lock.json";
import type { PackLock } from "./lock";

// A reader change bumps PACK_FORMATS; the data then has to be built and published again
// in the new format (npm run data:publish), or this fails.
describe("PACK_FORMATS", () => {
  it("is the format of every pack in the lock", () => {
    const { packs } = lockFile as PackLock;
    expect(PACK_FORMATS).toEqual(
      Object.fromEntries(
        Object.entries(packs).map(([name, entry]) => [name, entry.format]),
      ),
    );
  });
});
