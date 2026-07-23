import assert from "node:assert/strict";
import test from "node:test";
import { findBoundaryViolations } from "./check-runtime-boundaries.mjs";

test("rejects frontend imports of Worker and backend-only modules", () => {
  const violations = findBoundaryViolations([
    {
      filePath: "src/features/example/Page.tsx",
      source: `
        import { createWorkerApiApp } from "../../workers/api/router";
        import { Hono } from "hono";
      `,
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule, specifier }) => ({ rule, specifier })),
    [
      { rule: "frontend-runtime", specifier: "../../workers/api/router" },
      { rule: "frontend-runtime", specifier: "hono" },
    ],
  );
});

test("rejects Worker imports of browser persistence and React UI", () => {
  const violations = findBoundaryViolations([
    {
      filePath: "src/workers/api/example.ts",
      source: `
        export { App } from "../../app/App";
        const adapter = import("../../repositories/indexeddb/defaultRepositories");
        const dexie = require("dexie");
      `,
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule, specifier }) => ({ rule, specifier })),
    [
      { rule: "worker-runtime", specifier: "../../app/App" },
      { rule: "worker-runtime", specifier: "../../repositories/indexeddb/defaultRepositories" },
      { rule: "worker-runtime", specifier: "dexie" },
    ],
  );
});

test("rejects domain imports of repositories and frameworks", () => {
  const violations = findBoundaryViolations([
    {
      filePath: "src/domain/example.ts",
      source: `
        import type { RecipeRepository } from "../repositories/contracts";
        import React from "react";
      `,
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule, specifier }) => ({ rule, specifier })),
    [
      { rule: "domain-purity", specifier: "../repositories/contracts" },
      { rule: "domain-purity", specifier: "react" },
    ],
  );
});

test("allows shared pure modules to flow toward each runtime", () => {
  const violations = findBoundaryViolations([
    {
      filePath: "src/features/example/Page.tsx",
      source: `import type { Recipe } from "../../domain/recipe/types";`,
    },
    {
      filePath: "src/workers/api/example.ts",
      source: `import type { Recipe } from "../../domain/recipe/types";`,
    },
    {
      filePath: "src/domain/example.ts",
      source: `import type { Recipe } from "./recipe/types";`,
    },
  ]);

  assert.deepEqual(violations, []);
});
