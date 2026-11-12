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
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // noUncheckedIndexedAccess is on: `!` states an index the code knows is present.
      "@typescript-eslint/no-non-null-assertion": "off",
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
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    files: ["scripts/**", "e2e/serve.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
