import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = [
  "apps/client",
  "apps/admin",
  "packages/shared",
  "packages/database",
  "packages/ui",
  "packages/content",
];
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? files(file)
      : /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")
        ? [file]
        : [];
  });
}
function imports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const result: string[] = [];
  function visit(node: ts.Node) {
    const value =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) &&
                node.expression.text === "require"))
          ? node.arguments[0]
          : undefined;
    if (value && ts.isStringLiteral(value)) result.push(value.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

describe("monorepo dependency boundaries", () => {
  for (const root of roots) {
    it(`${root} has no cross-app or undeclared package imports`, () => {
      const manifest = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
      const declared = new Set(
        Object.keys({
          ...manifest.dependencies,
          ...manifest.peerDependencies,
          ...manifest.devDependencies,
        }),
      );
      const violations: string[] = [];
      for (const file of files(`${root}/src`))
        for (const specifier of imports(file)) {
          if (specifier.startsWith(".")) {
            if (
              !path
                .resolve(path.dirname(file), specifier)
                .startsWith(path.resolve(root) + path.sep)
            )
              violations.push(`${file}: ${specifier}`);
          } else if (specifier.startsWith("@/")) {
            if (root.startsWith("packages/"))
              violations.push(`${file}: app alias ${specifier}`);
          } else if (!specifier.startsWith("node:")) {
            const dependency = specifier.startsWith("@")
              ? specifier.split("/").slice(0, 2).join("/")
              : specifier.split("/")[0];
            if (dependency !== manifest.name && !declared.has(dependency))
              violations.push(`${file}: undeclared ${dependency}`);
            if (/^@ttokttok\/(client|admin)$/.test(dependency))
              violations.push(`${file}: app dependency ${dependency}`);
          }
        }
      expect(violations).toEqual([]);
    });
  }

  it("shared remains independent of React, Next, DOM and network access", () => {
    const violations: string[] = [];
    for (const file of files("packages/shared/src")) {
      for (const specifier of imports(file))
        if (
          /^(react|next|@supabase|@ttokttok\/(ui|database|content)|node:)/.test(
            specifier,
          )
        )
          violations.push(`${file}: ${specifier}`);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isIdentifier(node) &&
          [
            "window",
            "document",
            "HTMLElement",
            "localStorage",
            "fetch",
          ].includes(node.text)
        )
          violations.push(`${file}: ${node.text}`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it("shared UI cannot import a database or app data layer", () => {
    const violations = files("packages/ui/src").flatMap((file) =>
      imports(file)
        .filter((specifier) =>
          /^(@supabase|@ttokttok\/(database|content)|@\/)/.test(specifier),
        )
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it("the privileged database factory is server-only", () => {
    expect(imports("packages/database/src/service.ts")).toContain(
      "server-only",
    );
    for (const app of ["client", "admin"])
      expect(imports(`apps/${app}/src/lib/supabase/admin.ts`)).toContain(
        "server-only",
      );
  });
});
