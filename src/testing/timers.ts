/** setTimeout/clearTimeout driven by `advance`, so debounce and backoff run on demand. */
export function manualTimers() {
  let clock = 0;
  let nextId = 0;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout(run: () => void, ms: number) {
      pending.set(++nextId, { at: clock + ms, run });
      return nextId;
    },
    clearTimeout(id: unknown) {
      pending.delete(id as number);
    },
    advance(ms: number) {
      clock += ms;
      const due = [...pending]
        .filter(([, t]) => t.at <= clock)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        pending.delete(id);
        t.run();
      }
    },
    /** How long until the next timer runs; undefined when none is set. */
    next() {
      const times = [...pending.values()].map((t) => t.at - clock);
      return times.length > 0 ? Math.min(...times) : undefined;
    },
  };
}
