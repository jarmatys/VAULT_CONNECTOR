import { createSoftureEslintConfig } from "@softure-ai/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The `@softure-ai/config` preset: recommended JS and type-checked TypeScript rules; Next's configs ride in `extends`.
export default createSoftureEslintConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ["context/**", ".claude/**", ".open-next/**", ".wrangler/**", "cloudflare-env.d.ts"],
  extends: [...nextVitals, ...nextTs],
});
