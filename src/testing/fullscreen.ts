import { expect, onTestFinished } from "vitest";
import { userEvent } from "vitest/browser";

const LOCK = "lingo-test-fullscreen";
/** Ends this file's hold on fullscreen; set while a test holds it. */
let release: (() => void) | undefined;

/**
 * Keeps fullscreen to this test until it ends. Test files run side by side in one
 * browser, which has one fullscreen element: another file's request would take it
 * from this test, or be denied. A Web Lock (shared by the test files' frames) makes
 * them take turns; the test's end leaves fullscreen and passes it on.
 */
async function holdFullscreen() {
  if (release) return;
  const held = new Promise<void>((done) => (release = done));
  await new Promise<void>((acquired) => {
    void navigator.locks.request(LOCK, () => {
      acquired();
      return held;
    });
  });
  onTestFinished(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } finally {
      release?.();
      release = undefined;
    }
  });
}

/**
 * Puts `element` in fullscreen from the user's click, as the sites' buttons do, and
 * keeps it there for this test (left when the test ends). A request the browser
 * denies (a busy runner can let the click's activation lapse) is clicked again.
 */
export async function enterFullscreen(element: Element) {
  await holdFullscreen();
  for (let attempt = 1; ; attempt++) {
    let denied = false;
    const button = document.createElement("button");
    button.textContent = "Full screen";
    button.style.cssText =
      "position: fixed; top: 0; left: 0; z-index: 2147483647;";
    button.onclick = () =>
      void element.requestFullscreen().catch(() => {
        denied = true;
      });
    document.body.append(button);
    await userEvent.click(button);
    button.remove();
    await expect
      .poll(() => denied || document.fullscreenElement === element)
      .toBe(true);
    if (document.fullscreenElement === element) return;
    if (attempt === 3) throw new Error("Fullscreen request denied 3 times");
  }
}
