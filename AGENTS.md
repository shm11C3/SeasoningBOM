# AGENTS.md

This file gives AI coding agents project-specific guidance for SeasoningBOM.

## Project Summary

SeasoningBOM is a local-first joke recipe app.

It treats:

- recipes as GitHub repositories
- ingredients as dependencies
- best-before dates as EOL
- use-by date expiration as unsupported
- recipe checks as `nom audit`
- shopping list generation as `nom install`
- recipe snapshots as SeasoningBOM JSON

The app is intentionally funny, but food safety behavior must be conservative.

## Current Phase

The repository has an MVP web implementation scaffold and core app flow.

`package.json` and `src/` are present. Keep implementation work aligned with the docs and add an ADR for new architectural decisions.

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

Original requirements are in:

- `docs/requirements.md`

If implementation and docs disagree, update the docs or explain why the implementation needs an ADR.

## Confirmed Decisions

- App name: `SeasoningBOM`
- Package name: `seasoning-bom`
- License: MIT
- MVP target: Web first
- Stack: React + Vite + TypeScript
- UI: `@primer/react`
- Icons: temporary internal SVG placeholders in `src/ui/components/TemporaryIcons.tsx`
- Web persistence: IndexedDB
- IndexedDB wrapper: Dexie.js
- React DB binding: `dexie-react-hooks` / `useLiveQuery`
- Package manager: pnpm
- Lint / format: Biome
- Tests: Vitest + Testing Library
- CI: GitHub Actions

## Architecture Rules

### Domain logic must be pure

Keep these as UI-independent and DB-independent pure functions:

- lifecycle status calculation
- `nom audit`
- SeasoningBOM generation
- `nom install` shopping list generation
- recipe recommendation scoring

Do not call `Date.now()` or `new Date()` inside domain functions. Pass `now` from the caller.

### Do not leak storage details

Use Repository contracts for persistence.

Allowed:

- `features` call Repository contracts
- IndexedDB implementation uses Dexie

Forbidden:

- React components directly accessing Dexie tables
- `domain/` importing Dexie
- `domain/` importing React
- storing computed lifecycle status in DB
- storing generated SeasoningBOM snapshots in DB

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
    indexeddb/
    memory/
  db/
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

Avoid:

- Renaming EOL to "expiration" in UI unless explaining to non-technical users
- Calling use-by expiration "EOL"; it is `unsupported`
- Treating joke recipe licenses as the real source license

## Testing Guidance

Prioritize tests for:

1. lifecycle status edge cases
2. `nom audit` severity rules
3. unsupported / hazardous exclusion
4. SeasoningBOM output shape
5. backup import/export round trip

Use fixed `now` values in tests.

## Documentation Guidance

When adding or changing behavior:

- Update relevant docs in `docs/`.
- Add an ADR for architectural decisions.
- Keep README concise and user-facing.
- Keep AGENTS.md practical for future agents.

## Copywriting Guidance

Good:

- `nom audit found 3 issues`
- `milk will reach EOL tomorrow`
- `chicken is unsupported and excluded from recommendations`

Avoid:

- jokes that imply unsafe food is okay
- overclaiming SPDX / CycloneDX compatibility
- using GitHub terms in ways that hide the actual food-safety meaning
