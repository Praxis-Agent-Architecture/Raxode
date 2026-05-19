import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const assetExtensions = new Set([".md", ".json", ".txt", ".yaml", ".yml"]);
const sourceRoot = path.resolve("raxode-cli");
const distRoot = path.resolve("dist/raxode-cli");

function rewriteCompiledProjectDescriptor(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteCompiledProjectDescriptor(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteCompiledProjectDescriptor(entry)]),
    );
  }
  if (typeof value === "string" && value.endsWith(".ts")) {
    return `${value.slice(0, -3)}.js`;
  }
  return value;
}

async function copyAsset(source, target, relative) {
  await mkdir(path.dirname(target), { recursive: true });
  if (relative === "backend/rax.project.json") {
    const descriptor = JSON.parse(await readFile(source, "utf8"));
    await writeFile(target, `${JSON.stringify(rewriteCompiledProjectDescriptor(descriptor), null, 2)}\n`, "utf8");
    return;
  }
  await cp(source, target, { force: true });
}

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
    await copyAsset(source, target, relative);
  }
}

await copyAssets(sourceRoot);
