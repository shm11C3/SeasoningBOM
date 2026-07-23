# Deployment

SeasoningBOM deploys the Vite frontend to Cloudflare Pages and the Hono API to Cloudflare Workers with a D1 binding named `DB`.

Use one public origin. The Pages site serves the app and a Worker route handles `/api/*` on the same custom domain. Keep `VITE_SEASONINGBOM_API_BASE_URL=/api`; a separate API origin is not supported by the MVP because it would add a CORS and credential boundary.

## Prerequisites

- Node.js 24 or later
- pnpm 11 through Corepack
- a Cloudflare account and a zone for the production custom domain
- a Clerk application with Google and GitHub social login only
- the Clerk publishable key and JWT public key

Wrangler is invoked as `pnpm dlx wrangler@4`, so the repository does not require a globally installed CLI. See Cloudflare's current documentation for [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Local Cloud Workflow

1. Install dependencies.

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Create `.env.local` from `.env.example` and `.dev.vars` from `.dev.vars.example`. Replace both Clerk placeholders. Do not commit either local file.

3. Initialize local D1 and optionally load the public examples.

   ```bash
   pnpm run db:migrate:local
   pnpm run db:seed:local
   ```

4. Start the API and frontend in separate terminals.

   ```bash
   pnpm run dev:worker
   ```

   ```bash
   pnpm dev
   ```

5. Verify `http://127.0.0.1:5173/api/health`, public repository browsing, Clerk sign-in, profile bootstrap, private inventory, Star, and Fork.

Local Wrangler state is stored under `.wrangler/` and is intentionally ignored by Git.

## Production Worker And D1

Do not attach the public `/api/*` route until this sequence is complete.

1. Authenticate Wrangler and run a dry build.

   ```bash
   pnpm dlx wrangler@4 login
   pnpm dlx wrangler@4 deploy --dry-run
   ```

2. Deploy the Worker once. The ID-less D1 binding in `wrangler.jsonc` uses Wrangler automatic provisioning and writes the created database ID back into the configuration. Preserve that generated ID in the deployment environment.

   ```bash
   pnpm dlx wrangler@4 deploy
   ```

3. Apply migrations to the remote database. Loading examples is optional but useful for an empty public launch.

   ```bash
   pnpm dlx wrangler@4 d1 migrations apply seasoning-bom --remote
   pnpm dlx wrangler@4 d1 execute seasoning-bom --remote --file examples/seed-public-repositories.sql
   ```

4. Store the Clerk values as Worker secrets. `CLERK_AUTHORIZED_PARTIES` must be the exact Pages custom origin without a trailing slash.

   ```bash
   pnpm dlx wrangler@4 secret put CLERK_JWT_KEY
   pnpm dlx wrangler@4 secret put CLERK_AUTHORIZED_PARTIES
   ```

5. Deploy again and verify the Workers URL before adding the production route.

   ```bash
   pnpm dlx wrangler@4 deploy
   ```

## Production Pages

1. Build with production Clerk configuration and the same-origin API path.

   ```bash
   VITE_SEASONINGBOM_API_BASE_URL=/api \
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_replace_me \
   pnpm build
   ```

2. Create the Pages project once, then upload `dist/`.

   ```bash
   pnpm dlx wrangler@4 pages project create seasoning-bom
   pnpm dlx wrangler@4 pages deploy dist --project-name seasoning-bom
   ```

3. Attach the Pages custom domain. Configure the Worker route for `<custom-domain>/api/*` in the same Cloudflare zone, then set the Clerk authorized origin and redirect URLs to that exact HTTPS origin.

4. Run the release checklist against the custom domain. Keep the `pages.dev` preview URL out of `CLERK_AUTHORIZED_PARTIES` unless it is intentionally supported.

## Rollback

- Pages: select the previous successful deployment in Workers & Pages.
- Worker: roll back to the previous Worker version in the Cloudflare dashboard.
- D1: migrations are forward-only. Export or back up production data before applying a new migration, and ship corrective migrations instead of editing an already-applied file.
