import esbuild from "esbuild";
import process from "process";

const isProduction = process.argv[2] === "production";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  external: ["obsidian", "electron", "@electron/remote"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  minify: isProduction,
  outfile: "main.js"
});
