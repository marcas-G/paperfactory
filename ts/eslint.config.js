import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // global ignores must live in an object with no other keys (flat config)
    ignores: ["dist/**", "coverage/**", "node_modules/**", "src/api/static/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);