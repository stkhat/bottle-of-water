import { PacksUnavailableError } from "../../core/packs/unavailable";
import { isAbortError } from "../abort";

/**
 * Reports a failure in the console. Language data that is not on the device yet is
 * none (the page waits for it, and the download shows elsewhere), nor is the work of a
 * video the user moved on from.
 */
export function warn(error: unknown) {
  if (error instanceof PacksUnavailableError) return;
  if (isAbortError(error)) return;
  console.warn("Langle:", error);
}
