# ADR 0004: Keep domain logic as pure functions

## Status

Accepted

## Context

SeasoningBOM contains several domain rules that must be correct and testable:

- EOL lifecycle status
- unsupported / hazardous food safety behavior
- `nom audit`
- `nom install`
- SeasoningBOM JSON generation
- recipe recommendations

These rules should not depend on React, IndexedDB, or the current system clock.

## Decision

Implement core domain logic as pure functions.

Examples:

- `calculateLifecycleStatus(input)`
- `runNomAudit(input)`
- `generateSeasoningBOM(input)`
- `generateShoppingList(input)`
- `recommendRecipes(input)`

Functions must receive all required data as arguments, including `now`.

## Consequences

Positive:

- Easy unit testing.
- Stable behavior across UI and storage changes.
- Easier future mobile support.
- Safer food-related logic.

Negative:

- Call sites must pass `now` and settings explicitly.
- Some convenience is traded for testability.

Mitigations:

- Provide small app-level helper hooks/services to gather data and call pure functions.
- Keep function input types explicit.

