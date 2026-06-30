# ADR 0001: Web-first React + Vite architecture

## Status

Accepted

## Context

SeasoningBOM is a joke-first recipe app intended to be published as source code. The product concept depends on quickly delivering a GitHub-like Web UI and local-first data storage.

The initial requirements mention both Web and mobile:

- Web storage: IndexedDB
- Mobile storage: SQLite
- Storage differences hidden by Repository layer

Building Web and mobile simultaneously would increase initial complexity and slow down the MVP.

## Decision

MVP will be Web-first.

Use:

- React
- Vite
- TypeScript

Mobile support is deferred. The architecture will still define Repository contracts so a future SQLite implementation can be added without rewriting domain logic.

## Consequences

Positive:

- Faster MVP.
- Easier public demo.
- Better fit for GitHub-like UI.
- Simpler local-first implementation with IndexedDB.

Negative:

- Mobile SQLite implementation is not validated in MVP.
- Some UI assumptions may need revisiting for native mobile.

Mitigations:

- Keep domain logic framework-independent.
- Keep persistence behind Repository contracts.
- Avoid browser-only assumptions in `domain/`.

