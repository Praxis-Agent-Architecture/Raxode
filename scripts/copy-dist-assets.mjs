import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const assetExtensions = new Set([".md", ".json", ".txt", ".yaml", ".yml"]);
const sourceRoot = path.resolve("raxode-cli");
const distRoot = path.resolve("dist/raxode-cli");

async function copyAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    const relative = path.relative(sourceRoot, source);
    if (relative.startsWith(`reports${path.sep}`) || relative.startsWith(`frontend${path.sep}legacy-src${path.sep}memory${path.sep}generated${path.sep}`)) {
      continue;
    }
    if (entry.isDirectory()) {
      await copyAssets(source);
      continue;
    }
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) {
      continue;
    }
    const target = path.join(distRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
}

await copyAssets(sourceRoot);
