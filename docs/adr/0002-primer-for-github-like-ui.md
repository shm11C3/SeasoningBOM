# ADR 0002: Use Primer for GitHub-like UI

## Status

Accepted, amended 2026-07-03

## Context

The core joke of SeasoningBOM is that recipes look like GitHub repositories:

- Code tab
- Dependencies tab
- Security alerts
- Releases
- Issues
- command-like output such as `nom audit`

The UI needs to feel close enough to GitHub that the joke is immediately understandable.

## Decision

Use:

- `@primer/react`

Do not use `@primer/octicons-react` in the app UI for now. Use temporary internal SVG placeholders in `src/ui/components/TemporaryIcons.tsx` until the final icon direction is decided.

## Consequences

Positive:

- Strong GitHub-like visual language.
- Faster implementation of tabs, labels, buttons, dialogs, forms.
- Better joke clarity.
- Icons are clearly provisional and can be replaced later without touching feature code.

Negative:

- Adds dependency weight.
- Placeholder icons are less polished than a final icon set.
- Some customization may be constrained by Primer primitives.

Mitigations:

- Prefer Primer defaults.
- Keep app-specific wrappers in `src/ui/github`.
- Avoid over-customizing until MVP flow is complete.
- Keep temporary icons centralized in `src/ui/components/TemporaryIcons.tsx`.
