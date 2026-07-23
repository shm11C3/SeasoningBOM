# ADR 0014: Enforce runtime boundaries inside one package

## Status

Accepted

## Context

The Cloud MVP contains a React browser app, a Cloudflare Worker API, D1 adapters, and shared pure domain logic. Splitting them into workspace packages now would add dependency publishing, build, and deployment overhead without changing product behavior. Keeping one package without enforcement, however, allows backend dependencies to leak into the browser or browser storage and UI dependencies to leak into the Worker and domain layers.

## Decision

Keep one `package.json` for the MVP and enforce runtime boundaries mechanically:

- `tsconfig.app.json` typechecks browser and React sources;
- `tsconfig.worker.json` typechecks Worker and D1 sources with Web Worker globals;
- the root TypeScript build references both runtime projects;
- `pnpm run check:boundaries` parses imports and rejects frontend-to-backend, backend-to-browser, and domain-to-runtime dependencies;
- boundary rule self-tests and the real source scan run through the normal `pnpm run check` path.

Shared code may flow into both runtimes only when it remains free of UI, persistence implementation, Worker, and provider dependencies. Repository contracts and pure domain modules are the intended shared boundary.

## Consequences

- Runtime mistakes fail locally and in CI before bundling or deployment.
- One lockfile and install remain sufficient for the MVP.
- New source roots or runtime-specific packages must update the boundary rules and tests.
- A workspace split should be reconsidered when web and Worker deployments need independent dependency/version lifecycles, when build isolation materially improves delivery time, or when shared modules need a separately consumable package. Until one of those conditions exists, separate packages would add structure without reducing risk beyond the current checks.
