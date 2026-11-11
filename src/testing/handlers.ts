import { expect } from "vitest";
import type { Handle } from "../background/handlers";
import type { RequestOf, RequestType, ResponseOf } from "../messaging/protocol";

/** Sends a request to `handle()` and returns the value; an error reply fails the test. */
export function replyValue(handle: () => Handle) {
  return async <T extends RequestType>(
    request: { type: T } & RequestOf<T>,
  ): Promise<ResponseOf<T>> => {
    const reply = await handle()(request);
    if (!reply.ok) throw new Error(`error reply: ${reply.error}`);
    // Replies cross runtime.sendMessage, which keeps only what JSON keeps.
    expect(JSON.parse(JSON.stringify(reply))).toEqual(reply);
    return reply.value as ResponseOf<T>;
  };
}
