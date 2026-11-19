/** A `downloadprogress` event of the browser's built-in AI APIs (Translator, Prompt API). */
interface DownloadProgress extends Event {
  readonly loaded: number;
  readonly total?: number;
}

/** Download progress as a share, whether `loaded` is one (current) or bytes of `total`. */
export function progressShare(event: Event): number {
  const { loaded, total } = event as DownloadProgress;
  const value = total !== undefined && total > 1 ? loaded / total : loaded;
  return Math.min(1, Math.max(0, value));
}
