import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Shark UI components: copied from the registry, not ours to
    // restyle, and the React Compiler lint rules flag their internals.
    "components/ui/**",
    "hooks/use-is-mobile.tsx", // installed with @shark/sidebar
  ]),
])

export default eslintConfig
