# ADR 0002: Use Primer for GitHub-like UI

## Status

Accepted

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
- `@primer/octicons-react`

for the MVP UI.

## Consequences

Positive:

- Strong GitHub-like visual language.
- Faster implementation of tabs, labels, buttons, dialogs, forms.
- Better joke clarity.

Negative:

- Adds dependency weight.
- Some customization may be constrained by Primer primitives.

Mitigations:

- Prefer Primer defaults.
- Keep app-specific wrappers in `src/ui/github`.
- Avoid over-customizing until MVP flow is complete.

