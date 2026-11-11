import { afterEach, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
} from "../core/settings";
import type { send } from "../messaging/client";
import { colorScheme } from "../testing/media";
import { listeners } from "../testing/stubs";
import { color } from "./lookup/styles";
import { followTheme } from "./page-theme";
import { palettes } from "./theme";

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

const added: Element[] = [];
afterEach(() => {
  added.splice(0).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-lingo-theme");
});

/** An extension page as its index.html starts: "system" until the settings answer. */
function extensionPage() {
  document.documentElement.dataset.lingoTheme = "system";
  const style = document.createElement("style");
  style.textContent = `body{background:${color.surface}}`;
  document.head.append(style);
  const before = new Set(document.head.children);
  const settings = listeners<Settings>();
  let answer!: (settings: Settings) => void;
  const answered = new Promise<Settings>((resolve) => (answer = resolve));
  followTheme({
    send: (() => answered) as typeof send,
    watchSettings: settings.watch,
  });
  added.push(
    style,
    ...[...document.head.children].filter((el) => !before.has(el)),
  );
  const background = () => getComputedStyle(document.body).backgroundColor;
  return { answer, change: settings.emit, background };
}

const withTheme = (theme: Settings["theme"]) =>
  mergeSettings({ theme }, DEFAULT_SETTINGS);

it("follows the browser's dark mode until a theme is picked", async () => {
  await colorScheme("dark");
  const page = extensionPage();
  expect(page.background()).toBe(rgb(palettes.dark.surface));
  page.answer(withTheme("system"));
  await expect.poll(page.background).toBe(rgb(palettes.dark.surface));

  page.change(withTheme("light"));
  expect(page.background()).toBe(rgb(palettes.light.surface));
  page.change(withTheme("dark"));
  await colorScheme("light");
  expect(page.background()).toBe(rgb(palettes.dark.surface));
});
