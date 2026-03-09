import { build as esbuild } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function buildServer() {
  console.log("Building server...");
  await esbuild({
    entryPoints: [path.resolve(rootDir, "server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.resolve(rootDir, "dist/index.cjs"),
    external: ["express", "better-sqlite3"],
    packages: "external",
  });
  console.log("✓ Server build complete");
}

buildServer().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});