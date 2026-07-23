// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/node_modules/**",
      "**/src-tauri/gen/**",
      "**/*.gen.ts",
      "**/.claude/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Konflikt ze strictTypeChecked (no-non-null-assertion): dla znanych,
      // gwarantowanych elementów DOM (np. #root z index.html) `!` jest czytelniejsze.
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      // Bez tego flagowany jest idiomatyczny wzorzec onChange={(e) => setX(e.target.value)}
      // wszędzie w formularzach - to nie jest "mylące", tylko standardowy React.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["packages/domain/**/*.{ts,tsx}", "**/domain/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      // `await act(async () => { vi.advanceTimersByTime(...) })` jest tu celowym idiomem
      // przy fałszywych timerach: callback sam w sobie nie ma `await`, ale oznaczenie go
      // `async` sprawia, że OTACZAJĄCY `await act(...)` odczekuje dodatkowy tik mikrozadań,
      // w którym rozwiązują się mockowane obietnice (np. `invokeCommand`) wywołane przez
      // timer. Usunięcie `async` zmieniłoby faktyczne zachowanie testów (ryzyko cichej
      // niestabilności), więc reguła jest wyłączona tylko dla plików testowych.
      "@typescript-eslint/require-await": "off",
    },
  },
  eslintConfigPrettier,
);
