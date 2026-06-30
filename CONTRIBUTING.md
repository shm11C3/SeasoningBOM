# Contributing to SeasoningBOM

SeasoningBOM is a public-source joke app, but contributions should keep the implementation readable, testable, and safe.

## Project Status

The project is currently in design/documentation phase. Implementation scaffolding will be added later.

## Development Principles

1. **Joke first, safety always**
   - Keep the GitHub / SBOM / supply-chain humor.
   - Do not encourage unsafe food consumption.

2. **Domain logic first**
   - EOL calculation, `nom audit`, SeasoningBOM generation, and recommendations should be pure functions.

3. **Local-first**
   - MVP stores data in IndexedDB.
   - Server DB, accounts, and cloud sync are out of scope for MVP.

4. **Readable public code**
   - Prefer explicit types.
   - Keep docs updated.
   - Add tests for domain rules.

## Before Making Changes

Read:

- `README.md`
- `AGENTS.md`
- `docs/overview.md`
- `docs/architecture.md`
- relevant ADRs in `docs/adr/`

## Architecture Changes

If a change affects a confirmed architecture decision, add or update an ADR.

Examples:

- changing persistence strategy
- replacing Primer
- adding a global state library
- changing core data model boundaries
- changing lifecycle status rules

## Testing Expectations

Once implementation exists, changes to domain behavior should include tests.

High-priority test areas:

- lifecycle status date boundaries
- unsupported / hazardous behavior
- `nom audit` severity
- SeasoningBOM JSON shape
- backup import/export

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

