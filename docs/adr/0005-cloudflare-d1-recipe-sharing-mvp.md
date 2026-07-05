# ADR 0005: Cloudflare D1 recipe sharing MVP

## Status

Accepted

## Context

The original MVP was a local-first Web app backed by IndexedDB. The updated requirements redefine SeasoningBOM as a GitHub-parody recipe sharing service with public/private/unlisted repositories, authenticated users, stars, forks, contribution graphs, and user-private inventory.

## Decision

Treat `docs/seasoningbom_requirements_cloud_d1.md` as the canonical P0 product direction. The production MVP will target Cloudflare Pages, Workers, and D1, with authenticated identity. ADR 0008 selects Clerk social login for P0 authentication.

The existing React UI, pure domain logic, tests, and repository-contract shape remain useful. The IndexedDB implementation is no longer the production persistence target; keep it as a local prototype/development adapter unless a later decision removes it.

## Consequences

- Product scope moves from a local-first joke app to a hosted sharing service.
- Repository ownership, visibility, auth, stars, forks, and contributions become P0 domain concepts.
- Inventory remains private user data even though recipe repositories can be public.
- Existing docs that describe IndexedDB as the MVP persistence target are superseded by this decision and must be updated before implementation work continues.
