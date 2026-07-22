# ADR 0013: Clone complete repository snapshots when forking

## Status

Accepted

## Context

A Fork that copies only repository metadata produces a destination with no ingredients or transitive dependencies. The user sees the source relationship, but cannot continue editing or cooking the same recipe.

## Decision

`POST /api/repos/:owner/:repo/fork` clones the source repository metadata, components, and transitive dependencies. Every cloned repository, component, and dependency receives a fresh ID, while `source_repository_id` retains the direct source relationship.

The Worker writes the destination metadata, complete dependency manifest, and `repository_forked` Contribution event in one D1 batch. A failed read or write leaves no partial Fork.

Star state remains viewer-specific and is exposed separately through authenticated `GET`, `POST`, and `DELETE` requests to `/api/repos/:owner/:repo/star`; it is not copied by Fork.

## Consequences

- A Fork is immediately usable as an independent recipe.
- Later source changes do not mutate existing Forks.
- Existing manifest row limits also bound Fork batch size.
- Fork chains preserve the immediate source rather than flattening to the original root.
