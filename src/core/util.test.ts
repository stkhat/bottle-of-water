import { describe, expect, it } from "vitest";
import { serial } from "./util";

describe("serial", () => {
  it("runs each task once the one before has settled", async () => {
    const queue = serial();
    const log: string[] = [];
    let release!: () => void;
    const first = queue.run(
      () =>
        new Promise<string>((resolve) => {
          log.push("first starts");
          release = () => resolve("one");
        }),
    );
    const second = queue.run(() => {
      log.push("second starts");
      return "two";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["first starts"]);
    release();
    expect(await first).toBe("one");
    expect(await second).toBe("two");
    expect(log).toEqual(["first starts", "second starts"]);
  });

  it("rejects only the failed task's promise, tells onError and goes on", async () => {
    const errors: unknown[] = [];
    const queue = serial((error) => errors.push(error));
    const failure = new Error("no room");
    const failed = queue.run(() => Promise.reject(failure));
    const next = queue.run(() => "after");
    await expect(failed).rejects.toBe(failure);
    expect(await next).toBe("after");
    expect(errors).toEqual([failure]);
  });

  it("is idle once the tasks queued so far have settled, failed ones included", async () => {
    const queue = serial();
    const done: string[] = [];
    void queue.run(async () => {
      await Promise.resolve();
      done.push("a");
    });
    queue
      .run(() => Promise.reject(new Error("b")))
      .catch(() => done.push("b failed"));
    await queue.idle;
    expect(done).toEqual(["a", "b failed"]);
  });
});
