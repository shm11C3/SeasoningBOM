# ADR 0011: Use full replacement for granular dependency mutations

## Status

Accepted

## Context

The Cloud D1 MVP already supports replacing a repository's full dependency manifest with `PUT /api/repos/:owner/:repo/dependencies`.

The frontend also needs smaller owner-only operations for adding, editing, and deleting a single recipe component or a single transitive dependency. Partial update semantics would need field-level merge rules, unset/null behavior, and extra validation paths that are easy to make inconsistent with the full manifest replacement API.

## Decision

Expose granular component and transitive dependency endpoints under:

```text
/api/repos/:owner/:repo/dependencies/components
/api/repos/:owner/:repo/dependencies/components/:componentId
/api/repos/:owner/:repo/dependencies/components/:componentId/dependencies
/api/repos/:owner/:repo/dependencies/components/:componentId/dependencies/:dependencyId
```

`POST` creates a complete resource, `PUT` replaces a complete resource, and `DELETE` removes it. Do not add granular `PATCH` endpoints for the MVP.

For updates and deletes, URL path IDs are authoritative. If a request body contains an `id`, the handler ignores it and uses the path `componentId` or `dependencyId`.

All granular mutations are owner-only and require Authorization bearer tokens. Clerk `__session` cookies are not accepted for these writes.

## Consequences

- The API has one validation shape for component/dependency writes instead of separate partial merge rules.
- Individual edits avoid resending the full dependency manifest while keeping deterministic replacement behavior.
- `ingredient_dependencies.id` is part of the D1-backed API contract because individual dependency updates and deletes need stable targets.
- Future partial-edit UX can still call these full replacement endpoints after composing the next full resource client-side.
