import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore legacy Node.js scripts
    "scripts/**/*.js",
    "scripts/**/*.mjs",
  ]),
  // Guard de paleta sobria — SOLO sobre lo migrado en la Fase 0 (se amplía el glob en fases siguientes).
  {
    files: [
      "components/shared/**/*.tsx",
      "app/(advisor-shell)/advisor/page.tsx",
      "app/(advisor-shell)/clients/new/page.tsx",
      "app/(advisor-shell)/analisis-cartola/page.tsx",
      "app/(advisor-shell)/portfolio-designer/components/ComparisonModeV2.tsx",
    ],
    ignores: ["components/shared/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\b(bg|text|border|from|to|via)-(blue|indigo|purple|teal|emerald|sky|violet|slate|amber|green|red|gray|orange|rose|cyan|pink|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900)\\b/]",
          message:
            "Color crudo fuera de marca. Usa tokens gb-* (navy domina, copper acento, azure acciones, gb-success/gb-danger solo mercado).",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\b(bg|text|border|from|to|via)-(blue|indigo|purple|teal|emerald|sky|violet|slate|amber|green|red|gray|orange|rose|cyan|pink|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900)\\b/]",
          message:
            "Color crudo fuera de marca. Usa tokens gb-* (navy domina, copper acento, azure acciones, gb-success/gb-danger solo mercado).",
        },
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/bg-gradient-/]",
          message: "Sin gradientes en el shell del asesor. Usa navy sólido o neutros.",
        },
        {
          selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/bg-gradient-/]",
          message: "Sin gradientes en el shell del asesor. Usa navy sólido o neutros.",
        },
      ],
    },
  },
]);

export default eslintConfig;
