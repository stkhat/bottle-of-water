import en from "./locales/en.json";

export type MessageKey = keyof typeof en;
export type MessageVars = Record<string, string | number>;

/** Replaces `{name}` placeholders; a placeholder without a matching var stays as literal text. */
export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : placeholder,
  );
}

export function t(key: MessageKey, vars?: MessageVars): string {
  return interpolate(en[key], vars);
}
