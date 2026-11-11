import { onTestFinished } from "vitest";
import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia(options: {
      colorScheme: "light" | "dark" | null;
    }): Promise<void>;
  }
}

/** The browser's color scheme until the test ends (vitest.config.ts `emulateMedia`). */
export async function colorScheme(scheme: "light" | "dark") {
  onTestFinished(() => commands.emulateMedia({ colorScheme: null }));
  await commands.emulateMedia({ colorScheme: scheme });
}
