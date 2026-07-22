# ADR 0012: Save recipe editor manifests atomically

## Status

Accepted

## Context

The Cloud editor saves repository metadata and the complete component/transitive-dependency manifest together. Calling the metadata and dependency endpoints separately can leave a partially updated recipe when the second request fails.

## Decision

`POST /api/repos` and `PATCH /api/repos/:owner/:repo` accept an optional `components` array. When present, it is a full manifest replacement and the Worker validates it before writing.

The D1 repository writes metadata, the applicable Contribution event, components, and transitive dependencies in one `DB.batch()` call. A component-only change records `recipe_updated`; a manifest identical to the stored manifest remains a no-op for Contribution purposes.

The existing dependency replacement and granular endpoints remain available for future-focused editing interfaces. Protected writes continue to require an Authorization bearer token.

## Consequences

- The current editor cannot leave metadata and dependencies at different revisions.
- Existing metadata-only API clients remain compatible.
- Full editor saves retain the 38-row component/dependency limit used by the D1 MVP.
