import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.cjs"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module",
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      // ── TypeScript type-safety ─────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],

      // ── No console — use structured logger ────────────────────────────────
      "no-console": "error",

      // ── Complexity guards ─────────────────────────────────────────────────
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],

      // ── Import hygiene ────────────────────────────────────────────────────
      "import/no-cycle": ["error", { maxDepth: 5 }],
      "import/no-duplicates": "error",
      "import/no-extraneous-dependencies": ["error", { devDependencies: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.ts"] }],

      // ── General correctness ───────────────────────────────────────────────
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "error",
    },
  },
  {
    // Relax rules for test files
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    // JSX screens naturally accumulate branch-heavy render composition. Keep the
    // signal visible without blocking correctness-focused lint gates.
    files: ["**/*.tsx"],
    rules: {
      complexity: ["warn", 12],
    },
  },
];
