import { browser } from "wxt/browser";
import type { Reply, RequestOf, RequestType, ResponseOf } from "./protocol";

const isReply = (value: unknown): value is Reply =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { ok?: unknown }).ok === "boolean";

/**
 * Sends a request to the background and resolves with its typed response. An error
 * reply is rethrown as an `Error` with the background's message.
 */
export async function send<T extends RequestType>(
  request: { type: T } & RequestOf<T>,
): Promise<ResponseOf<T>> {
  const reply: unknown = await browser.runtime.sendMessage(request);
  if (!isReply(reply))
    throw new Error(`No reply from the background to ${request.type}`);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as ResponseOf<T>;
}
