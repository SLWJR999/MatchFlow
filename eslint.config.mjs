import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Ces fichiers manipulent des résultats de jointures Supabase
    // (select("*, foo(bar)")) que le client ne type pas tant que le
    // projet n'a pas généré ses types réels avec
    // `supabase gen types typescript`. En attendant, `any` y est
    // délibéré plutôt qu'un oubli — voir README.
    files: [
      "lib/queries.ts",
      "lib/push.ts",
      "app/api/push/webhook/route.ts",
      "app/tournois/*/admin/*.tsx",
      "app/tournois/*/classement/*.tsx",
      "app/t/*/*.tsx",
      "app/matchs/*.tsx",
      "app/matchs/*/*.tsx",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
