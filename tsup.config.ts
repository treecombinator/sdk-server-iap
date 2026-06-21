import { defineConfig } from "tsup";

// One entry, no dependencies. Portable dual ESM + CJS + type declarations.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  outDir: "dist",
});
