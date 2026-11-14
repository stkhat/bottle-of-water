import { expect, onTestFinished } from "vitest";
import { userEvent } from "vitest/browser";

/**
 * Puts `element` in fullscreen from the user's click, as the sites' buttons do, and
 * leaves fullscreen when the test ends. A denied request fails the test here, not as an
 * unhandled rejection after it.
 */
export async function enterFullscreen(element: Element) {
  let denied: unknown;
  const button = document.createElement("button");
  button.textContent = "Full screen";
  button.style.cssText =
    "position: fixed; top: 0; left: 0; z-index: 2147483647;";
  button.onclick = () =>
    void element.requestFullscreen().catch((error: unknown) => {
      denied = error ?? "denied";
    });
  document.body.append(button);
  await userEvent.click(button);
  button.remove();
  onTestFinished(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  await expect
    .poll(() => denied !== undefined || document.fullscreenElement === element)
    .toBe(true);
  if (denied !== undefined)
    throw new Error(`Fullscreen request: ${String(denied)}`);
}
