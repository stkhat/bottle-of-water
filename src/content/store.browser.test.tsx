import { afterEach, expect, test } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../testing/shadow-root";
import { createStore, shallowEqual, useStoreSelect, type Store } from "./store";

afterEach(cleanUpMounts);

interface State {
  a: number;
  b: number;
  c: string;
}

function Shows(props: { store: Store<State>; renders: string[] }) {
  const { a, b } = useStoreSelect(
    props.store,
    ({ a, b }) => ({ a, b }),
    shallowEqual,
  );
  props.renders.push(`${a} ${b}`);
  return (
    <p>
      {a} {b}
    </p>
  );
}

test("useStoreSelect renders again when what it selects changes, not for other fields", async () => {
  const store = createStore<State>({ a: 1, b: 2, c: "x" });
  const renders: string[] = [];
  const screen = await mountInShadowRoot(
    <Shows store={store} renders={renders} />,
  );
  await expect.element(screen.getByText("1 2")).toBeVisible();
  const before = renders.length;
  store.set({ c: "y" });
  // Preact renders in a microtask: a frame later it would have.
  await new Promise(requestAnimationFrame);
  store.set({ b: 3 });
  await expect.element(screen.getByText("1 3")).toBeVisible();
  // One render for `b`, none for `c`.
  expect(renders.slice(before)).toEqual(["1 3"]);
});

test("useStoreSelect sees a change made before its listener was added", async () => {
  const store = createStore<State>({ a: 1, b: 2, c: "x" });
  const renders: string[] = [];
  // Changed during the first render, before the effect subscribes.
  function Changing() {
    if (store.get().a === 1) store.set({ a: 5 });
    return null;
  }
  const screen = await mountInShadowRoot(
    <>
      <Shows store={store} renders={renders} />
      <Changing />
    </>,
  );
  await expect.element(screen.getByText("5 2")).toBeVisible();
});

test("shallowEqual compares each field", () => {
  expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "y" })).toBe(false);
  expect(shallowEqual({ a: 1 }, { a: 1, b: 2 } as { a: number })).toBe(false);
});
