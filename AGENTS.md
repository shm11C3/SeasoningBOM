# AGENTS.md

This file gives AI coding agents project-specific guidance for SeasoningBOM.

## Project Summary

SeasoningBOM is a GitHub-parody recipe sharing service for engineers.

It treats:

- recipes as GitHub repositories
- ingredients as dependencies
- best-before dates as EOL
- use-by date expiration as unsupported
- recipe checks as `nom audit`
- shopping list generation as `nom install`
- recipe snapshots as SeasoningBOM JSON
- public recipe alerts as repository security alerts
- private inventory audits as owner-only security checks

The app is intentionally funny, but food safety behavior must be conservative.

## Current Phase

The repository has an MVP web implementation scaffold and core local app flow.

The current product direction is the Cloudflare D1 recipe sharing MVP in `docs/seasoningbom_requirements_cloud_d1.md`. Existing IndexedDB code is a local prototype/development adapter and migration base. Keep implementation work aligned with the docs and add an ADR for new architectural decisions.

## Canonical Docs

Read these before making architectural changes:

1. `docs/overview.md`
2. `docs/architecture.md`
3. `docs/data-model.md`
4. `docs/domain-logic.md`
5. `docs/repository-layer.md`
6. `docs/ui-design.md`
7. `docs/glossary.md`
8. `docs/adr/`

Current canonical product requirements are in:

- `docs/seasoningbom_requirements_cloud_d1.md`

Original local-first requirements are historical and remain useful for prior context:

- `docs/requirements.md`

If implementation and docs disagree, update the docs or explain why the implementation needs an ADR.

## Confirmed Decisions

- App name: `SeasoningBOM`
- Package name: `seasoning-bom`
- License: MIT
- MVP target: Web recipe sharing service
- Stack: React + Vite + TypeScript
- UI: `@primer/react`
- Icons: temporary internal SVG placeholders in `src/ui/components/TemporaryIcons.tsx`
- Hosting target: Cloudflare Pages
- API target: Cloudflare Workers
- Production persistence target: Cloudflare D1
- Auth target: Clerk social login
- Local prototype persistence: IndexedDB
- Local prototype IndexedDB wrapper: Dexie.js
- Local prototype React DB binding: `dexie-react-hooks` / `useLiveQuery`
- Package manager: pnpm
- Lint / format: Biome
- Tests: Vitest + Testing Library
- CI: GitHub Actions

## Architecture Rules

### Domain logic must be pure

Keep these as UI-independent and DB-independent pure functions:

- lifecycle status calculation
- public Recipe Alert generation
- private Inventory Audit generation
- SeasoningBOM generation
- `nom install` shopping list generation
- recipe recommendation scoring

Do not call `Date.now()` or `new Date()` inside domain functions. Pass `now` from the caller.

### Do not leak storage details

Use Repository contracts for persistence.

Allowed:

- `features` call Repository contracts
- Cloudflare implementation uses Workers / D1 behind contracts or API clients
- IndexedDB implementation uses Dexie

Forbidden:

- React components directly accessing Dexie tables
- React components directly accessing D1
- `domain/` importing Dexie
- `domain/` importing Cloudflare bindings
- `domain/` importing React
- storing computed lifecycle status in DB
- storing generated SeasoningBOM snapshots in DB
- including Inventory Audit details in public SeasoningBOM output

### Safety beats jokes

Never make UX copy or logic encourage unsafe food use.

Rules:

- `unsupported` means use-by date has passed and the item should not be recommended.
- `hazardous` means user marked it as dangerous and it should be treated as unavailable.
- Unsupported / hazardous ingredients must be excluded from recommendations and shopping-list availability.

## Expected Source Layout

Use this source shape unless an ADR changes it:

```text
src/
  app/
  features/
  domain/
  repositories/
    contracts/
    cloudflare-d1/
    indexeddb/
    memory/
  db/
  workers/
  ui/
  test/
```

## Naming Rules

Use:

- `SeasoningBOM` for the app and format
- `seasoning-bom` for package name
- `RecipeRepositoryEntity` for recipe repository data
- `RecipeComponent` for ingredients in a recipe
- `InventoryItem` for fridge/pantry items
- `LifecycleStatus` for `active | deprecated | eol | unsupported | hazardous`
- `UserHandle` / `ownerHandle` for stable SeasoningBOM URL ownership
- `RecipeAlert` for repository-derived public alerts
- `InventoryAudit` for owner-private inventory-derived audit results

Avoid:

- Renaming EOL to "expiration" in UI unless explaining to non-technical users
- Calling use-by expiration "EOL"; it is `unsupported`
- Treating joke recipe licenses as the real source license
- Mixing public Recipe Alerts and private Inventory Audit issues in one serialized result
- Treating a live provider username or email address as the mutable source of repository URLs

## Testing Guidance

Prioritize tests for:

1. lifecycle status edge cases
2. Recipe Alert vs Inventory Audit privacy boundaries
3. unsupported / hazardous exclusion
4. SeasoningBOM output shape and inventory-data exclusion
5. owner + slug repository identity and visibility authorization
6. backup import/export round trip for the local prototype adapter

Use fixed `now` values in tests.

Keep coverage thresholds at or above 90% for statements, branches, functions, and lines unless the project intentionally revises that bar.

Use the right test layer for the risk:

- Pure domain behavior belongs in Vitest unit tests with fixed `now` values.
- React feature behavior belongs in Testing Library tests through visible UI and repository contracts.
- IndexedDB persistence, backup import/export, and reload durability should have Playwright E2E coverage.
- For the local prototype, prefer proving persistence behavior through UI actions plus reload/export assertions before reaching into IndexedDB directly.
- Cloud D1 access-control behavior should be covered at the API/Worker layer and with E2E tests for public/private/unlisted visibility.
- For D1 batch writes, check current Cloudflare D1 query, batch, and bound-parameter limits. Keep MVP write batches inside the free-tier query budget unless docs explicitly justify a paid-tier assumption.

When changing `src/repositories/`, `src/db/`, or backup flows, run:

```bash
pnpm test
pnpm test:e2e
```

When changing user-facing flows, run Playwright for at least the touched workflow.

Before opening or updating a PR, run:

```bash
pnpm run check
pnpm test
pnpm build
pnpm test:e2e
```

## Documentation Guidance

When adding or changing behavior:

- Update relevant docs in `docs/`.
- Add an ADR for architectural decisions.
- Keep README concise and user-facing.
- Keep AGENTS.md practical for future agents.

## PR Workflow Guidance

- Ask CodeRabbit to review each PR, for example by commenting `@coderabbitai review`.
- Use squash merge for PRs.
- CodeRabbit review status does not satisfy GitHub rulesets that require an approving review. If a PR is blocked by `REVIEW_REQUIRED`, request or wait for a real GitHub approval; do not use administrator bypass unless the user explicitly authorizes bypassing branch protection.

## PR Self-Review Guidance

Before publishing a PR, check:

- Domain functions still avoid React, Dexie, repositories, `Date.now()`, and `new Date()`.
- React features still access persistence through Repository contracts.
- Computed lifecycle status and generated SeasoningBOM snapshots are not persisted.
- Public Recipe Alerts and private Inventory Audit issues remain separate.
- SeasoningBOM JSON excludes Inventory Audit details.
- Unsupported and hazardous inventory is excluded from recommendations and shopping-list availability.
- DB-affecting changes have reload-oriented Playwright E2E coverage.
- CI still runs check, Vitest coverage, build, and Playwright E2E.
- Docs and ADRs match the implementation, especially where MVP behavior is intentionally less strict than a future architecture goal.

## Copywriting Guidance

Good:

- `nom audit found 3 issues`
- `milk will reach EOL tomorrow`
- `chicken is unsupported and excluded from recommendations`

Avoid:

- jokes that imply unsafe food is okay
- overclaiming SPDX / CycloneDX compatibility
- using GitHub terms in ways that hide the actual food-safety meaning
