import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["node_modules/", "client/dist/", "coverage/"] },
  js.configs.recommended,
  {
    files: ["server/**/*.js", "*.config.js", "client/vite.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["client/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Sem eslint-plugin-react: marca componentes usados só em JSX como usados.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.test.{js,jsx}", "server/tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: { "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }] },
  },
];
