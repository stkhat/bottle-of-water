import type { MirrorEvent } from "../background/pack-store";
import type { CheckError } from "./error-log";

/**
 * Check builds only: a try of a pack mirror as an entry of the error log
 * (error-log.ts). The mirror that served a file is a record (`info`); a mirror that
 * failed is a warning, also when a later one served the file.
 */
export function mirrorEntry(
  event: MirrorEvent,
): Pick<CheckError, "level" | "message"> {
  const file = `Pack ${event.pack} ${event.file}`;
  return event.served
    ? {
        level: "info",
        message: `${file}: served by ${event.url} (${event.bytes} bytes, ${event.ms} ms)`,
      }
    : {
        level: "warning",
        message: `${file}: mirror failed, ${event.url}: ${event.error}`,
      };
}
