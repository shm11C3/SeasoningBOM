# Roadmap

SeasoningBOM のローカル MVP は完了済みです。現在のロードマップは、既存実装を Cloudflare D1 ベースの recipe sharing service へ統合することを中心にします。

## Phase 0: Design Baseline

Goal: 実装前に設計と開発ルールを固める。

Status: done

Delivered:

- README
- AGENTS.md
- Architecture docs
- Data model docs
- Domain logic docs
- Repository layer docs
- UI design docs
- Glossary
- ADRs

## Phase 1: Local MVP Scaffold

Goal: React + Vite + TypeScript のローカル prototype を構築し、品質ツールを整える。

Status: done

Delivered:

- Vite React TypeScript setup
- pnpm setup
- Biome setup
- Vitest setup
- GitHub Actions CI
- Primer setup
- Dexie setup
- initial folder structure

## Phase 2: Local Domain and UI MVP

Goal: 既存のローカルアプリ体験を完成させる。

Status: done

Delivered:

- lifecycle status function
- prototype `runNomAudit`
- `nom install` shopping list generation
- SeasoningBOM generation
- recipe recommendation scoring
- IndexedDB repository implementations
- memory repositories for tests
- backup export / import
- repository list and detail UI
- Code / Dependencies / Security tabs
- recipe editor
- inventory screen
- backup / restore screen
- Vitest and Playwright coverage for the local MVP

## Phase 3: Cloud D1 Requirements Integration

Goal: 新しい Cloud D1 要件を docs / ADR / implementation plan に統合する。

Status: completed

Deliverables:

- `docs/seasoningbom_requirements_cloud_d1.md` を canonical P0 要件として扱う
- Cloudflare Pages / Workers / D1 の architecture docs
- `owner + slug` repository identity
- Recipe Alert と Inventory Audit の privacy boundary
- SeasoningBOM から private inventory を除外する仕様
- local IndexedDB adapter と production D1 adapter の境界整理

Exit criteria:

- docs and ADRs no longer describe IndexedDB as the production MVP persistence target
- implementation migration slices are clear
- tests to protect privacy boundaries are identified

## Phase 4: Cloud D1 Backend MVP

Goal: hosted recipe sharing service の backend を作る。

Status: completed

Deliverables:

- Cloudflare Worker API scaffold
- D1 schema and migrations
- Clerk social login
- user_profiles table
- recipe repository CRUD
- `owner + slug` uniqueness
- public / private / unlisted authorization
- recipe components and ingredient dependencies
- private inventory CRUD
- Star / Fork primitives
- contribution events and cooking logs

Current implementation checkpoint:

- `migrations/0001_cloud_mvp.sql` defines the initial Cloud D1 MVP tables and indexes.
- `src/workers/api/` contains the Worker fetch entrypoint, health route, concrete API route registry, and JSON error responses.
- `src/workers/auth/clerk.ts` verifies Clerk session tokens with `@clerk/backend`, `CLERK_JWT_KEY`, and `CLERK_AUTHORIZED_PARTIES`, requiring a user subject, session id, and allowed `azp`.
- `GET /api/me` and `POST /api/me/profile` are wired to D1 `user_profiles` through `D1UserProfileRepository`.
- `GET /api/repos`, `GET /api/repos/:owner/:repo`, `POST /api/repos`, `PATCH /api/repos/:owner/:repo`, and `DELETE /api/repos/:owner/:repo` are wired to D1 `recipe_repositories` metadata through `D1RecipeRepository`.
- Creating a repository records `recipe_created`, content-affecting repository metadata updates record `recipe_updated`, and forking a repository records `repository_forked` in `contribution_events` in the same D1 batch as the repository write. Visibility-only or no-op updates do not create contribution events. Events derived from private repositories are stored as private contribution events.
- Public repositories can be listed and fetched without login. Unlisted repositories can be fetched by exact URL but are excluded from listings. Private repository metadata is owner-only.
- `GET /api/repos/:owner/:repo/dependencies` and `PUT /api/repos/:owner/:repo/dependencies` are wired to D1 `recipe_components` and `ingredient_dependencies` through `D1RecipeComponentRepository`.
- Repository dependency reads use the same public / unlisted / private read authorization as repository metadata. Repository dependency replacement is owner-only and requires a bearer token.
- Individual component and transitive dependency mutations are exposed through granular owner-only endpoints under `/api/repos/:owner/:repo/dependencies/components`.
- `GET /api/repos/:owner/:repo/bom` generates a SeasoningBOM JSON snapshot on demand from repository content and public Recipe Alerts only.
- `GET /api/repos/:owner/:repo/security` returns public Recipe Alerts only. `POST /api/repos/:owner/:repo/audit` returns the authenticated viewer's private Inventory Audit using MVP default audit settings.
- `POST /api/repos/:owner/:repo/star` and `DELETE /api/repos/:owner/:repo/star` are wired to D1 `repository_stars` through `D1RepositoryStarRepository`.
- `POST /api/repos/:owner/:repo/fork` creates a new D1 `recipe_repositories` row for the authenticated user and records the source repository in `source_repository_id`.
- `GET /api/inventory`, `POST /api/inventory`, `PATCH /api/inventory/:id`, and `DELETE /api/inventory/:id` are wired to D1 `inventory_items` through `D1InventoryRepository`.
- Inventory endpoints require a bootstrapped Clerk-backed profile and are scoped to the authenticated user. Inventory mutations require bearer tokens; `__session` cookies are limited to protected non-mutating reads.
- `GET /api/repos/:owner/:repo/cooking-logs` and `POST /api/repos/:owner/:repo/cooking-logs` are wired to D1 `cooking_logs` through `D1CookingLogRepository`.
- Creating a cooking log also creates a `cooking_logged` contribution event in the same D1 batch. Public cooking-log reads expose only logs from users with `contribution_visibility = "public"` plus the viewer's own logs.
- Cooking log creation can link explicit owned `usedInventoryItemIds` through `cooking_log_inventory_items` and records one private `eol_rescued` contribution when any linked item is `deprecated` at `cooked_at`.
- `GET /api/users/:username/profile`, `GET /api/users/:username/contributions`, and `GET /api/users/:username/contributions/:date` are wired to D1 `user_profiles` and `contribution_events` through `D1ContributionRepository`.
- Profile contribution reads expose annual graph counts for `summary_only` users, hide `private` contribution graphs from third parties, and expose day-level event details only to the owner or for `public` profiles.
- Protected endpoints reject missing or invalid sessions before reaching protected handlers. Manual Contribution CRUD endpoints are intentionally out of the Cloud D1 MVP; contribution events are recorded by source actions and exposed through profile read endpoints.

Exit criteria:

- public repositories can be fetched without login
- private repositories are owner-only
- unlisted repositories are URL-accessible but not listed
- inventory endpoints are authenticated and owner-only
- fork records source repository

## Phase 5: Frontend Cloud Migration

Goal: 既存 React UI を Cloud D1 API に接続し、GitHub 風共有体験へ移行する。

Status: complete

Current implementation checkpoint:

- `VITE_SEASONINGBOM_API_BASE_URL` explicitly selects the browser Cloud API adapter; an unset value preserves the IndexedDB prototype.
- `/users/:username` loads the public profile, annual Contribution graph, public repositories, and privacy-filtered day details from the Workers API.
- Cloud profile requests run in parallel, do not seed or subscribe to IndexedDB, and preserve the public profile when its Contribution graph is private.
- `/` lists public repositories from the Workers API without local-only inventory, audit, Star, or Fork estimates.
- `/:owner/:repo` loads repository metadata, direct and transitive dependencies, and public Recipe Alerts from the Workers API. Optional dependency or security failures do not hide successfully loaded repository metadata.
- Cloud repository pages download the server-generated SeasoningBOM from `GET /api/repos/:owner/:repo/bom`; they do not regenerate it from browser or IndexedDB state.
- Cloud dashboard, repository detail, repository editor, and profile routes do not seed or subscribe to IndexedDB. Unmigrated inventory, audit, EOL, and backup routes retain the local prototype behavior.
- Cloud mode enables Clerk's prebuilt sign-in and user controls when `VITE_CLERK_PUBLISHABLE_KEY` is configured. Local mode does not initialize Clerk, and a missing Clerk key does not block public Cloud reads.
- Cloud API reads attach the current Clerk session token as a bearer token only when token retrieval succeeds. Signed-out reads and public reads whose token refresh fails continue anonymously without an Authorization header.
- Signed-in users bootstrap their stable User Handle through `GET /api/me` and `POST /api/me/profile`. Cloud repository create/edit/delete requires a bearer token and saves metadata plus the full dependency manifest atomically.
- `/inventory` lists and mutates only the signed-in user's D1 inventory. Cloud mode does not seed or subscribe to IndexedDB for this route, and signed-out visitors do not request private inventory.
- Signed-in repository viewers receive `Your inventory audit` from the protected `/audit` endpoint. Public Recipe Alerts remain a separate public response, and signed-out visitors never request or render inventory-derived audit details.
- Signed-in repository viewers can read and toggle their Star state. Non-owners can Fork a readable shared repository, including its complete component and transitive-dependency snapshot, and continue from the new owner URL.

Remaining deliverables:

- None. Phase 6 release polish is next.

Exit criteria:

- a public repository URL can be shared and opened by another user
- owner can edit their repository
- non-owner cannot access private repositories
- private Inventory Audit details are not visible to public visitors
- SeasoningBOM output excludes inventory-derived data

## Phase 6: Release Polish

Goal: Cloud MVP を公開可能にする。

Status: complete

Deliverables:

- example repositories
- screenshots / demo GIF
- README usage section
- accessibility pass
- responsive layout pass
- release checklist
- deployment docs

Current implementation checkpoint:

- local and production Worker/D1 workflows are documented around `wrangler.jsonc`, same-origin `/api`, Clerk secrets, and D1 migrations;
- two idempotent public example repositories are available in `examples/seed-public-repositories.sql` and covered by a SQLite smoke test;
- README includes actual dashboard and dependency screenshots plus local Cloud usage;
- skip navigation, visible focus treatment, and keyboard-operable repository tabs are covered by component and browser tests;
- desktop and 390 px mobile layouts are visually checked, with mobile horizontal overflow guarded by Playwright;
- `docs/release-checklist.md` covers CI, Cloudflare, auth/privacy, safety, and product smoke tests.

Exit criteria:

- fresh clone setup works
- Cloudflare local/dev workflow is documented
- CI is green
- license and contribution docs are present

## P1 Features

After Cloud MVP:

- Pull Request-style recipe suggestions
- Issues-style warnings
- recipe version history
- Releases tab
- recipe diff
- `recipe-lock.json`
- dependency graph visualization
- audit result history for the signed-in user
- EOL calendar
- README-style recipe page improvements
- tags / license / maintainer fields

## P2 Features

Longer-term / joke expansion:

- Organizations / Teams
- Discussions-style cooking notes
- Actions-style cooking workflow
- CHANGELOG-style recipe history
- trending repositories
- `nom outdated`
- `nom dedupe`
- `nom ci`
- barcode scanning
- receipt OCR
- mobile app / SQLite adapter

## Prioritization Rule

When uncertain, prioritize in this order:

1. Food safety correctness
2. Privacy and authorization boundaries
3. Domain core testability
4. GitHub-like joke clarity
5. Existing local prototype durability
6. Visual polish
7. Future extensibility
