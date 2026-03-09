import { build } from "vite";
import { build as esbuild } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function buildClient() {
  console.log("Building client...");
  await build({
    root: path.resolve(rootDir, "client"),
    mode: "production",
    build: {
      outDir: path.resolve(rootDir, "dist/public"),
      emptyOutDir: true,
    },
  });
  console.log("✓ Client build complete");
}

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

async function main() {
  try {
    await buildClient();
    await buildServer();
    console.log("\n✓ Build completed successfully!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

main();
