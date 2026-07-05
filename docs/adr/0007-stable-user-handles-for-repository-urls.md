# ADR 0007: Stable User Handles for Repository URLs

## Status

Accepted, amended by ADR 0008

## Context

The Cloud D1 MVP uses Clerk-authenticated identity and GitHub-style repository URLs such as `/:owner/:repo`. External provider usernames, display names, and email addresses can change, but recipe repository URLs should not unexpectedly change or collide because provider-side profile data changed.

## Decision

Use `auth_provider + auth_subject` as the authentication identity key.

Use `user_profiles.username` as a SeasoningBOM User Handle:

- initialized from Clerk/provider profile hints or explicit user input at first sign-in
- normalized before storage and URL use
- globally unique inside SeasoningBOM
- used as `owner` in `/:owner/:repo` and as `username` in `/users/:username`
- not automatically changed in P0 when provider-side username, display name, or email changes

Handle rename flows and old-URL redirects are deferred to P1 or later.

## Consequences

- Repository URLs remain stable after provider-side profile changes.
- Authorization uses `owner_user_id`, not the route handle string alone.
- The app needs a conflict path if the desired initial handle is already reserved.
- Docs and implementation should avoid treating live provider usernames or email addresses as mutable repository URL ownership.
