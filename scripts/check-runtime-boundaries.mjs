import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const FRONTEND_PREFIXES = ["src/app/", "src/features/", "src/ui/"];
const BACKEND_PREFIXES = ["src/repositories/cloudflare-d1/", "src/workers/"];

const rules = [
  {
    appliesTo: FRONTEND_PREFIXES,
    forbiddenPackages: ["@clerk/backend", "hono"],
    forbiddenPaths: BACKEND_PREFIXES,
    name: "frontend-runtime",
  },
  {
    appliesTo: BACKEND_PREFIXES,
    forbiddenPackages: ["@clerk/react", "dexie", "dexie-react-hooks", "react", "react-dom"],
    forbiddenPaths: [
      "src/app/",
      "src/db/",
      "src/features/",
      "src/repositories/cloud-api/",
      "src/repositories/indexeddb/",
      "src/ui/",
    ],
    name: "worker-runtime",
  },
  {
    appliesTo: ["src/domain/"],
    forbiddenPackages: [
      "@clerk/backend",
      "@clerk/react",
      "dexie",
      "dexie-react-hooks",
      "hono",
      "react",
      "react-dom",
    ],
    forbiddenPaths: [
      "src/app/",
      "src/db/",
      "src/features/",
      "src/repositories/",
      "src/ui/",
      "src/workers/",
    ],
    name: "domain-purity",
  },
];

export function findBoundaryViolations(sourceFiles) {
  const violations = [];

  for (const { filePath, source } of sourceFiles) {
    const normalizedFilePath = normalizePath(filePath);
    const matchingRules = rules.filter((rule) => hasPrefix(normalizedFilePath, rule.appliesTo));
    if (matchingRules.length === 0) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      normalizedFilePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      normalizedFilePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    for (const moduleReference of collectModuleReferences(sourceFile)) {
      const targetPath = resolveSourcePath(normalizedFilePath, moduleReference.specifier);
      for (const rule of matchingRules) {
        if (
          isForbiddenPackage(moduleReference.specifier, rule.forbiddenPackages) ||
          (targetPath !== null && hasPrefix(targetPath, rule.forbiddenPaths))
        ) {
          const location = sourceFile.getLineAndCharacterOfPosition(moduleReference.position);
          violations.push({
            column: location.character + 1,
            filePath: normalizedFilePath,
            line: location.line + 1,
            rule: rule.name,
            specifier: moduleReference.specifier,
          });
        }
      }
    }
  }

  return violations.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.column - right.column ||
      left.rule.localeCompare(right.rule),
  );
}

function collectModuleReferences(sourceFile) {
  const references = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      references.push({
        position: node.moduleSpecifier.getStart(sourceFile),
        specifier: node.moduleSpecifier.text,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      references.push({
        position: node.arguments[0].getStart(sourceFile),
        specifier: node.arguments[0].text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function resolveSourcePath(filePath, specifier) {
  if (specifier.startsWith(".")) {
    return normalizePath(path.posix.join(path.posix.dirname(filePath), specifier));
  }
  if (specifier.startsWith("src/")) {
    return normalizePath(specifier);
  }
  return null;
}

function isForbiddenPackage(specifier, packages) {
  return packages.some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

function hasPrefix(value, prefixes) {
  return prefixes.some((prefix) => value === prefix.slice(0, -1) || value.startsWith(prefix));
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

async function collectTypeScriptFiles(directory, rootDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(absolutePath, rootDirectory)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push({
        filePath: normalizePath(path.relative(rootDirectory, absolutePath)),
        source: await readFile(absolutePath, "utf8"),
      });
    }
  }

  return files;
}

async function main() {
  const rootDirectory = process.cwd();
  const sourceFiles = await collectTypeScriptFiles(path.join(rootDirectory, "src"), rootDirectory);
  const violations = findBoundaryViolations(sourceFiles);

  if (violations.length === 0) {
    console.log(`Runtime boundary check passed (${sourceFiles.length} files).`);
    return;
  }

  console.error("Runtime boundary violations:");
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}:${violation.column} [${violation.rule}] forbidden import '${violation.specifier}'`,
    );
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
