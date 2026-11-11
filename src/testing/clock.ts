/** A clock that moves only when the test says. */
export function fakeClock(start = 1_000_000) {
  const clock = {
    time: start,
    now: () => clock.time,
    tick: (ms = 1000) => (clock.time += ms),
  };
  return clock;
}
