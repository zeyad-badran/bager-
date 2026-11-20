/**
 * Tests for the module boundary and header checker.
 *
 * Serves:   docs/code-style.md §1 and §3. Proves the checker can FAIL, not only pass:
 *           a checker that never complains would look identical to a working one.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { findViolations } from "./check-module-boundaries.mjs";

const HEADER = "/**\n * Fixture.\n *\n * Module:   x\n * Serves:   FR-01\n */\n";
const roots = [];

/** Build a throwaway repo with the given { "relative/path.ts": "source" } files. */
function makeRepo(files) {
  const root = mkdtempSync(path.join(tmpdir(), "bager-boundaries-"));
  roots.push(root);
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const M = "apps/web/src/modules";

describe("module boundaries", () => {
  it("allows importing another module through its index", () => {
    const root = makeRepo({
      [`${M}/orders/index.ts`]: HEADER + "export const a = 1;\n",
      [`${M}/queue/index.ts`]: HEADER + 'import { a } from "../orders";\nexport const b = a;\n',
    });
    assert.deepEqual(findViolations(root), []);
  });

  it("allows files inside one module to import each other freely", () => {
    const root = makeRepo({
      [`${M}/orders/index.ts`]: HEADER + 'export { a } from "./internal";\n',
      [`${M}/orders/internal.ts`]: HEADER + "export const a = 1;\n",
    });
    assert.deepEqual(findViolations(root), []);
  });

  it("rejects a deep import into another module", () => {
    const root = makeRepo({
      [`${M}/orders/index.ts`]: HEADER + 'export { a } from "./internal";\n',
      [`${M}/orders/internal.ts`]: HEADER + "export const a = 1;\n",
      [`${M}/queue/index.ts`]: HEADER + 'import { a } from "../orders/internal";\nexport const b = a;\n',
    });
    const violations = findViolations(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, "BOUNDARY");
    assert.match(violations[0].message, /orders/);
  });

  it("rejects a deep re-export too", () => {
    const root = makeRepo({
      [`${M}/orders/internal.ts`]: HEADER + "export const a = 1;\n",
      [`${M}/queue/index.ts`]: HEADER + 'export { a } from "../orders/internal";\n',
    });
    assert.equal(findViolations(root).filter((v) => v.rule === "BOUNDARY").length, 1);
  });

  it("rejects code outside the modules folder that reaches into a module", () => {
    const root = makeRepo({
      [`${M}/orders/internal.ts`]: HEADER + "export const a = 1;\n",
      "apps/web/src/app/page.ts": HEADER + 'import { a } from "../modules/orders/internal";\nexport const b = a;\n',
    });
    assert.equal(findViolations(root).filter((v) => v.rule === "BOUNDARY").length, 1);
  });

  it("rejects product code importing from spikes/", () => {
    const root = makeRepo({
      "spikes/web-push/try.ts": "export const a = 1;\n",
      [`${M}/queue/index.ts`]: HEADER + 'import { a } from "../../../../../spikes/web-push/try";\nexport const b = a;\n',
    });
    assert.equal(findViolations(root).filter((v) => v.rule === "BOUNDARY").length, 1);
  });

  it("ignores import-looking text inside comments", () => {
    const root = makeRepo({
      [`${M}/orders/internal.ts`]: HEADER + "export const a = 1;\n",
      [`${M}/queue/index.ts`]: HEADER + '// import { a } from "../orders/internal";\nexport {};\n',
    });
    assert.deepEqual(findViolations(root), []);
  });
});

describe("file headers", () => {
  it("rejects a file without a header comment", () => {
    const root = makeRepo({ [`${M}/orders/index.ts`]: "export const a = 1;\n" });
    const violations = findViolations(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, "HEADER");
  });

  it("rejects a header that has no Serves line", () => {
    const root = makeRepo({ [`${M}/orders/index.ts`]: "/**\n * Module: x\n */\nexport const a = 1;\n" });
    const violations = findViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /Serves:/);
  });
});
