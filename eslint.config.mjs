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

    /**
     * Vendored libraries, minified. Nothing here is ours to fix.
     *
     * GSAP alone raised 16 errors and most of a few hundred warnings, all
     * from its minifier aliasing `this` - which is normal in minified output
     * and not a defect. The cost is not the noise: it is that a real error in
     * our own code arrives on page three of a failing report and gets
     * scrolled past, which already nearly happened once.
     */
    "public/vendor/**",

    /** Standalone design mock-ups, not part of the built site. */
    "design-previews/**",
  ]),
]);

export default eslintConfig;
