import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backend Apps Script & alat lokal bukan bagian dari bundle Next.js.
    "apps-script/**",
    "dev/**",
    "scripts/**",
    "tests/**",
    "sample-data/**",
    // Skill/agen lokal (bukan kode aplikasi).
    ".agents/**",
    // File metadata macOS di drive exFAT.
    "**/._*",
  ]),
]);

export default eslintConfig;
