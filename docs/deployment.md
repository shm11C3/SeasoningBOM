# Deployment

SeasoningBOM deploys the Vite frontend to Cloudflare Pages and the Hono API to Cloudflare Workers with a D1 binding named `DB`.

Use one public origin. The Pages site serves the app and a Worker route handles `/api/*` on the same custom domain. Keep `VITE_SEASONINGBOM_API_BASE_URL=/api`; a separate API origin is not supported by the MVP because it would add a CORS and credential boundary. This decision is recorded in [ADR 0015](adr/0015-same-origin-pages-worker-routing.md).

## Prerequisites

- Node.js 24 or later
- pnpm 11 through Corepack
- a Cloudflare account and a zone for the production custom domain
- a Clerk application with Google and GitHub social login only
- the Clerk publishable key and JWT public key

Wrangler is pinned to `4.113.0` in `devDependencies` and invoked through `pnpm exec`, so local and deployment commands use the lockfile-managed CLI. See Cloudflare's current documentation for [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Local Cloud Workflow

1. Install dependencies.

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Create `.env.local` from `.env.example` and `.dev.vars` from `.dev.vars.example`. Replace both Clerk placeholders. Do not commit either local file.

3. Initialize local D1.

   ```bash
   pnpm run db:migrate:local
   ```

4. Optionally load the public examples.

   ```bash
   pnpm run db:seed:local
   ```

5. Start the API and frontend in separate terminals.

   ```bash
   pnpm run dev:worker
   ```

   ```bash
   pnpm dev
   ```

6. Verify `http://127.0.0.1:5173/api/health`, public repository browsing, Clerk sign-in, profile bootstrap, private inventory, Star, and Fork.

Local Wrangler state is stored under `.wrangler/` and is intentionally ignored by Git.

## Production Worker And D1

Do not attach the public `/api/*` route until this sequence is complete.

1. Authenticate Wrangler and run a dry build.

   ```bash
   pnpm exec wrangler login
   pnpm exec wrangler deploy --dry-run
   ```

2. Run the first deployment from this checked-out repository, not from the Cloudflare dashboard or CI. The ID-less D1 binding uses [Wrangler automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning). The CLI creates D1 and writes its `database_id` back into `wrangler.jsonc`.

   ```bash
   pnpm exec wrangler deploy
   git diff -- wrangler.jsonc
   ```

   Verify that `database_id` was added, then commit and merge that generated ID before any CI, dashboard, or later deployment. Do not continue with an ID-less configuration: dashboard provisioning cannot write the ID back to the repository.

3. Apply migrations to that remote database.

   ```bash
   pnpm exec wrangler d1 migrations apply seasoning-bom --remote
   ```

4. Optionally load the public examples for an empty launch.

   ```bash
   pnpm exec wrangler d1 execute seasoning-bom --remote --file examples/seed-public-repositories.sql
   ```

5. Store the Clerk values as Worker secrets. `CLERK_AUTHORIZED_PARTIES` must be the exact Pages custom origin without a trailing slash.

   ```bash
   pnpm exec wrangler secret put CLERK_JWT_KEY
   pnpm exec wrangler secret put CLERK_AUTHORIZED_PARTIES
   ```

6. Deploy again and verify the Workers URL before adding the production route.

   ```bash
   pnpm exec wrangler deploy
   ```

## Production Pages

1. Store the real `pk_live_...` Clerk publishable key in `VITE_CLERK_PUBLISHABLE_KEY` in the deployment environment. Then validate it and build with the same-origin API path.

   ```bash
   case "$VITE_CLERK_PUBLISHABLE_KEY" in
     pk_live_*) ;;
     *) echo "VITE_CLERK_PUBLISHABLE_KEY must contain the production Clerk key" >&2; exit 1 ;;
   esac
   VITE_SEASONINGBOM_API_BASE_URL=/api \
   pnpm build
   ```

2. Create the Pages project once, then upload `dist/`.

   ```bash
   pnpm exec wrangler pages project create seasoning-bom
   pnpm exec wrangler pages deploy dist --project-name seasoning-bom
   ```

3. Attach the Pages custom domain. Configure the Worker route for `<custom-domain>/api/*` in the same Cloudflare zone, then set the Clerk authorized origin and redirect URLs to that exact HTTPS origin.

4. Run the release checklist against the custom domain. Keep the `pages.dev` preview URL out of `CLERK_AUTHORIZED_PARTIES` unless it is intentionally supported.

## Rollback

- Pages: select the previous successful deployment in Workers & Pages.
- Worker: roll back to the previous Worker version in the Cloudflare dashboard.
- D1: migrations are forward-only. Export or back up production data before applying a new migration, and ship corrective migrations instead of editing an already-applied file.
