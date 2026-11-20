#!/usr/bin/env node
/**
 * Module boundary and header checker (dependency-free).
 *
 * Serves:   docs/code-style.md §1 (header on every file) and §3 (layering),
 *           CLAUDE.md "Stack": each module under apps/web/src/modules/<name> exposes a public
 *           index.ts and other modules import ONLY through it.
 *
 * Two checks, both run by `pnpm check:boundaries` and by CI:
 *   1. BOUNDARY  A file may import another module only through that module's `index`
 *                (`../orders`, never `../orders/state-machine`). Product code must never
 *                import from `spikes/` (spikes are throwaway).
 *   2. HEADER    Every .ts/.tsx source file starts with a block comment that has a
 *                `Module:` line and a `Serves:` line, so any file can be traced to its
 *                requirement in one glance.
 *
 * The logic lives in `findViolations` so it can be unit-tested (see the .test.mjs next to this
 * file); running the script directly prints the violations and exits 1 if there are any.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const ENTRY_FILE_NAMES = new Set(["", "index"]);

/** Recursively list source files under `dir`; returns [] if the folder does not exist. */
function listSourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return SOURCE_EXTENSIONS.includes(path.extname(name)) ? [full] : [];
  });
}

/** Remove comments so words like "import ... from" inside a comment cannot be mistaken for code. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every module specifier a file imports, re-exports or dynamically imports. */
function importSpecifiers(source) {
  const code = stripComments(source);
  const patterns = [
    /\b(?:import|export)\s[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g, // import x from "y" / export * from "y"
    /\bimport\s*['"]([^'"]+)['"]/g, //                           import "y"
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, //                    import("y")
  ];
  return patterns.flatMap((pattern) => [...code.matchAll(pattern)].map((match) => match[1]));
}

/**
 * Turn an import specifier into an absolute path inside the repo, or null for packages
 * (`node:test`, `react`, ...) that are none of our business here.
 */
function resolveLocal(specifier, importerFile, modulesRoot) {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(importerFile), specifier);
  const alias = specifier.match(/^@\/modules\/(.+)$/); // optional "@/modules/..." path alias
  if (alias) return path.join(modulesRoot, alias[1]);
  return null;
}

/** Name of the module a path belongs to, or null if the path is outside `modulesRoot`. */
function moduleOf(absolutePath, modulesRoot) {
  const relative = path.relative(modulesRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep)[0] ?? null;
}

function checkBoundaries(file, source, repoRoot, modulesRoot) {
  const violations = [];
  const importerModule = moduleOf(file, modulesRoot);
  const spikesRoot = path.join(repoRoot, "spikes");

  for (const specifier of importSpecifiers(source)) {
    const target = resolveLocal(specifier, file, modulesRoot);
    if (target === null) continue;

    if (target === spikesRoot || target.startsWith(spikesRoot + path.sep)) {
      violations.push({ file, rule: "BOUNDARY", message: `imports from spikes/ ("${specifier}"); spikes are throwaway` });
      continue;
    }

    const targetModule = moduleOf(target, modulesRoot);
    if (targetModule === null || targetModule === importerModule) continue;

    const rest = path.relative(path.join(modulesRoot, targetModule), target).replace(/\.(ts|tsx|js|mjs)$/, "");
    if (!ENTRY_FILE_NAMES.has(rest)) {
      violations.push({
        file,
        rule: "BOUNDARY",
        message: `reaches into module "${targetModule}" via "${specifier}"; import "../${targetModule}" instead`,
      });
    }
  }
  return violations;
}

function checkHeader(file, source) {
  const header = source.match(/^(?:#!.*\n)?\s*\/\*\*[\s\S]*?\*\//)?.[0];
  if (!header) return [{ file, rule: "HEADER", message: "missing header comment (docs/code-style.md §1)" }];
  const missing = ["Module:", "Serves:"].filter((label) => !header.includes(label));
  return missing.map((label) => ({ file, rule: "HEADER", message: `header comment lacks a "${label}" line` }));
}

/**
 * Check every source file under `<repoRoot>/apps/*​/src`.
 * @returns {{file: string, rule: "BOUNDARY" | "HEADER", message: string}[]}
 */
export function findViolations(repoRoot) {
  const appsDir = path.join(repoRoot, "apps");
  const modulesRoot = path.join(appsDir, "web", "src", "modules");
  let apps = [];
  try {
    apps = readdirSync(appsDir);
  } catch {
    /* no apps folder yet: nothing to check */
  }

  return apps
    .flatMap((app) => listSourceFiles(path.join(appsDir, app, "src")))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...checkBoundaries(file, source, repoRoot, modulesRoot), ...checkHeader(file, source)];
    });
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = findViolations(repoRoot);
  if (violations.length === 0) {
    console.log("Module boundaries and file headers: OK");
    return;
  }
  for (const v of violations) {
    console.error(`${v.rule}  ${path.relative(repoRoot, v.file)}: ${v.message}`);
  }
  console.error(`\n${violations.length} violation(s). See docs/code-style.md.`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
