import type { DetectLanguage } from "../content/article/should-run";
import type { TranslationProvider } from "../content/translate/translator";

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

export const detectEnglish: DetectLanguage = async () => ({
  isReliable: true,
  languages: [{ language: "en", percentage: 99 }],
});

export const noTranslation: TranslationProvider = {
  translate: async () => undefined,
};
