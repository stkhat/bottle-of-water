// Imported by the page scripts: no dependencies.

/** The error of an aborted call (a fetch, a page call, a signal's `abortError`). */
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";
