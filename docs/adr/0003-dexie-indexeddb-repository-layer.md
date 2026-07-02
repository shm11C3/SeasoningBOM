# ADR 0003: Dexie-backed IndexedDB behind Repository contracts

## Status

Superseded by ADR 0005 for production MVP persistence. Dexie-backed IndexedDB remains acceptable as a local prototype/development adapter.

## Context

SeasoningBOM is local-first and does not use a server DB in MVP.

The Web app must store:

- recipe repositories
- recipe components
- inventory items
- settings

The future mobile app may use SQLite. The application should not couple domain logic or UI directly to IndexedDB.

## Decision

Use Dexie.js as the IndexedDB wrapper for Web persistence.

Expose persistence through Repository contracts:

- `RecipeRepository`
- `RecipeComponentRepository`
- `InventoryRepository`
- `SettingsRepository`
- `BackupRepository`

React components may use `dexie-react-hooks` / `useLiveQuery` for live updates, but IndexedDB-specific logic remains in `repositories/indexeddb`.

## Consequences

Positive:

- IndexedDB implementation is readable.
- Migrations are easier than raw IndexedDB.
- Repository contracts prepare for future SQLite.
- Backup / restore can be implemented cleanly.

Negative:

- Adds Dexie dependency.
- Repository contract must be maintained as the domain evolves.

Mitigations:

- Keep contracts small.
- Add memory repositories for tests.
- Avoid leaking Dexie types outside indexeddb implementation.
