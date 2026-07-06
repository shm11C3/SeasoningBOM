# ADR 0009: Use Hono for Worker API routing

## Status

Accepted

## Context

The Cloud D1 MVP exposes a growing Worker API for health checks, Clerk-backed profile bootstrap, recipe repository metadata, inventory, and contribution endpoints. The first Worker scaffold used a handwritten router with pathname normalization and regular expression route matching.

As more routes move from scaffold to implementation, the handwritten matcher would make method handling, path parameters, and route registration harder to keep consistent. The project should keep the joke-app surface low cost while avoiding custom infrastructure where a small, Worker-friendly library can carry the routing mechanics.

## Decision

Use Hono as the routing layer for Cloudflare Workers API code.

The Worker entrypoint still accepts standard `Request` and `WorkerEnv` values, and route handlers continue to return standard `Response` objects. Hono owns route matching, path parameters, Worker bindings, and strict/trailing-slash behavior. The API router uses `strict: false` so existing routes with and without a trailing slash remain equivalent.

Hono must stay in the `workers/` API boundary. Domain logic remains pure, and D1 access remains behind Worker route handlers and Cloudflare D1 repository implementations.

## Consequences

- Adding API routes uses Hono route registration instead of regular expression matcher lists.
- Existing auth policy remains unchanged: protected mutations require bearer tokens, protected non-mutating reads may use Clerk cookies until explicit CSRF handling is added, and private routes require a bootstrapped profile.
- Hono becomes a production dependency because Worker runtime code imports it.
- Tests should keep covering method allowlists, auth boundaries, trailing slash behavior, and scaffolded routes so framework migration does not change API semantics.
