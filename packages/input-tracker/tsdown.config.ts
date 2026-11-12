import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "browser",
  target: "es2022",
  dts: {
    sourcemap: true
  },
  sourcemap: true,
  clean: true,
  publint: {
    level: "error"
  },
  attw: {
    profile: "esm-only",
    level: "error"
  }
});
