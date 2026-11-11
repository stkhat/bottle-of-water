import type { DetectLanguage } from "../content/article/should-run";
import type { TranslationProvider } from "../content/translate/translator";
import type { Settings } from "../core/settings";

/** Listeners the test calls, as `storage.onChanged` would. */
export function listeners<T>() {
  const all = new Set<(value: T) => void>();
  return {
    watch(listener: (value: T) => void) {
      all.add(listener);
      return () => {
        all.delete(listener);
      };
    },
    emit(value: T) {
      for (const listener of [...all]) listener(value);
    },
    count: () => all.size,
  };
}

/** `watchSettings`'s listeners: `emit` gives them the settings and the ones emitted before. */
export function settingsListeners(initial: Settings) {
  let previous = initial;
  const all = new Set<(settings: Settings, previous: Settings) => void>();
  return {
    watch(listener: (settings: Settings, previous: Settings) => void) {
      all.add(listener);
      return () => {
        all.delete(listener);
      };
    },
    emit(settings: Settings) {
      const before = previous;
      previous = settings;
      for (const listener of [...all]) listener(settings, before);
    },
    count: () => all.size,
  };
}

export const detectEnglish: DetectLanguage = async () => ({
  isReliable: true,
  languages: [{ language: "en", percentage: 99 }],
});

export const noTranslation: TranslationProvider = {
  translate: async () => undefined,
};
