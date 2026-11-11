import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      ".output",
      ".wxt",
      "coverage",
      "test-results",
      "playwright-report",
      "reports",
      "e2e/pages",
      "data/raw",
      "public/packs",
      "data/packs",
      "data/publish",
      ".stryker-tmp",
      ".vitest",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "chrome",
          message: "Use `browser` from wxt/browser instead of chrome.*",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "navigator",
          property: "userAgent",
          message: "Detect features, not browsers",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='userAgent'][object.property.name='navigator']",
          message: "Detect features, not browsers",
        },
      ],
    },
  },
  {
    files: ["scripts/**", "e2e/serve.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
