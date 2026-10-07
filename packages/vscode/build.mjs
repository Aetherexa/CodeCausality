import { build } from "esbuild";

await build({
  bundle: true,
  minify: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": "\"production\"",
  },
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
});
