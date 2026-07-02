# ADR 0007: Stable User Handles for Repository URLs

## Status

Accepted

## Context

The Cloud D1 MVP uses GitHub OAuth for identity and GitHub-style repository URLs such as `/:owner/:repo`. GitHub usernames can change, but recipe repository URLs should not unexpectedly change or collide because a provider-side login changed.

## Decision

Use `provider + provider_user_id` as the authentication identity key.

Use `users.username` as a SeasoningBOM User Handle:

- initialized from the GitHub OAuth login at first sign-in
- normalized before storage and URL use
- globally unique inside SeasoningBOM
- used as `owner` in `/:owner/:repo` and as `username` in `/users/:username`
- not automatically changed in P0 when the GitHub username changes

Handle rename flows and old-URL redirects are deferred to P1 or later.

## Consequences

- Repository URLs remain stable after a provider-side username change.
- Authorization uses `owner_user_id`, not the route handle string alone.
- The app needs a conflict path if the desired initial handle is already reserved.
- Docs and implementation should avoid treating live GitHub usernames as mutable repository URL ownership.
