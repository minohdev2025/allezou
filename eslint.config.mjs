import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Les copies de travail des agents : c'est le même dépôt, avec ses dépendances
    // installées. Les laisser passer faisait analyser le projet trois fois, plus le
    // contenu de node_modules.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
