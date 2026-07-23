# ADR 0015: Serve Pages and Worker API from one origin

## Status

Accepted

## Context

The Cloud MVP deploys the React application to Cloudflare Pages and the Hono API to Cloudflare Workers. Hosting them on separate public origins would require a CORS policy, broaden the browser credential boundary, and add another production URL to Clerk configuration and release verification.

Local development still needs separate Vite and Wrangler processes, but Vite can proxy `/api` to the local Worker without changing the application-facing API URL.

## Decision

Serve the production Pages application and Worker API from one HTTPS custom origin:

- Pages serves the application routes and static assets;
- a Cloudflare Worker route handles `/api/*` on the same custom domain;
- the frontend uses the relative `VITE_SEASONINGBOM_API_BASE_URL=/api` in local and production builds;
- Vite proxies `/api` to Wrangler only during local development;
- a separate public API origin is outside the Cloud MVP boundary.

## Consequences

- Browser API requests do not require an MVP CORS policy.
- Clerk authorized parties and redirect URLs can be limited to the exact application origin.
- The Cloudflare route must be attached only after the Worker, D1 migrations, and secrets are verified.
- Preview URLs need explicit Clerk authorization if they are intentionally supported.
- Introducing a separate API origin later requires a new decision covering CORS, token audiences, authorized origins, and deployment ownership.
