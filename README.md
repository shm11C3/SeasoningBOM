# SeasoningBOM

> If cooking were a software supply chain.

SeasoningBOM is a GitHub-parody recipe sharing service that treats recipes like repositories, ingredients like dependencies, expiration dates like EOL, and food safety checks like `nom audit`.

料理を **Repository**、材料を **Dependencies**、賞味期限を **EOL**、監査を **`nom audit`** として扱う、GitHub 風のネタ系レシピ共有サービスです。

> [!NOTE]
> これはコードを全く理解せずに初期開発をし、そこから問題なくリリース・運用に持っていけるかの実験でもある。
>
> この段階以降のプロダクトオーナーはリポジトリ管理者本人です。AI は開発支援者として参加し、リリース判断と継続的な運用の責任はプロダクトオーナーが担います。

## Concept

```text
curry-rice@1.2.0
├── rice@2go
├── curry-roux@half-box
│   ├── wheat
│   ├── milk
│   └── soy
├── potato@3pieces
├── carrot@1piece
└── pork@300g
```

SeasoningBOM helps you:

- manage recipes as GitHub-like repositories
- share public, private, and unlisted recipe repositories
- manage private fridge inventory
- detect ingredients nearing EOL
- avoid unsupported ingredients past their use-by date
- separate public recipe alerts from private inventory audits
- generate a SeasoningBOM JSON snapshot
- create a shopping list with `nom install`

It is a joke app, but food safety is not a joke: expired use-by ingredients are treated as unsupported and are not recommended.

## Product Status

Current phase: **Cloud D1 MVP implemented; release candidate**.

The current React + Vite app includes local IndexedDB persistence, pure domain logic, GitHub-like recipe repository screens, inventory management, security/EOL dashboards, SeasoningBOM JSON download, and backup / restore. Cloud mode supports Clerk-backed profile bootstrap, D1 recipe and inventory writes, private Inventory Audit results, Star/Fork interactions, and Contribution graphs without exposing private inventory in public Recipe Alerts.

The canonical product direction is now the Cloudflare Pages / Workers / D1 recipe sharing service described in `docs/seasoningbom_requirements_cloud_d1.md`. Existing IndexedDB code is a local prototype and migration base.

## Screenshots

![SeasoningBOM repository dashboard](docs/assets/dashboard.png)

![Curry Rice repository detail](docs/assets/repository-detail.png)

## Getting Started

### Local prototype

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm run check
pnpm test
pnpm build
```

The dev server defaults to `http://127.0.0.1:5173/`.

### Cloud mode locally

Create local environment files from `.env.example` and `.dev.vars.example`, then replace the Clerk placeholders. Apply the local D1 migration and optional public examples:

```bash
pnpm run db:migrate:local
pnpm run db:seed:local
```

Run the Worker and Vite in separate terminals:

```bash
pnpm run dev:worker
pnpm dev
```

Vite proxies `/api` to the local Worker at `http://127.0.0.1:8787`. The frontend environment is:

To run the Cloud frontend against a same-origin Workers API, add `.env.local`:

```dotenv
VITE_SEASONINGBOM_API_BASE_URL=/api
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

Replace the Clerk placeholders with actual keys from the Clerk Dashboard; the example values are not valid configurations. Enable Google and GitHub social login only. Do not enable a SeasoningBOM-owned email/password flow. On first sign-in, the app asks the user to reserve a stable SeasoningBOM User Handle before protected writes are enabled. Without `VITE_SEASONINGBOM_API_BASE_URL`, the app keeps using the local IndexedDB prototype. With a Cloud API URL and the Clerk key left unset, public repository browsing remains available while sign-in is disabled.

See [Deployment](docs/deployment.md) for Cloudflare setup and [Release checklist](docs/release-checklist.md) before routing production traffic.

## Tech Stack

| Area | Decision |
| --- | --- |
| Language | TypeScript |
| UI | React |
| Build | Vite |
| UI library | `@primer/react` |
| Icons | Temporary internal SVG placeholders |
| Hosting target | Cloudflare Pages |
| API target | Cloudflare Workers |
| Production DB target | Cloudflare D1 |
| Auth target | Clerk social login |
| Local prototype storage | IndexedDB |
| Local prototype DB wrapper | Dexie.js |
| Local prototype React binding | `dexie-react-hooks` / `useLiveQuery` |
| Package manager | pnpm |
| Lint / Format | Biome |
| Test | Vitest + Testing Library |
| CI | GitHub Actions |

## MVP Scope

Cloud MVP target includes:

- Clerk Google / GitHub social login
- recipe repository CRUD with stable `owner + slug` URLs
- public / private / unlisted visibility
- private inventory CRUD
- lifecycle status calculation
- public Recipe Alerts and private Inventory Audits
- EOL / unsupported / hazardous / allergen / missing ingredient detection without leaking private inventory
- recipe recommendation using ingredients near EOL
- SeasoningBOM JSON download without Inventory Audit details
- Star, Fork, and Contribution graph basics
- GitHub-like repository detail UI
- Code / Dependencies / Security tabs

Local prototype currently includes:

- local IndexedDB persistence
- backup / restore JSON
- reload-oriented E2E coverage for local DB behavior

Cloud MVP excludes:

- real SPDX / CycloneDX compatibility
- nutrition database integration
- barcode scanning
- receipt OCR
- AI recipe generation
- mobile SQLite implementation

## Documentation

Start here:

- [Documentation index](docs/README.md)
- [Overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Domain Logic](docs/domain-logic.md)
- [Repository Layer](docs/repository-layer.md)
- [UI Design](docs/ui-design.md)
- [SeasoningBOM Format](docs/seasoning-bom-format.md)
- [Glossary](docs/glossary.md)
- [Roadmap](docs/roadmap.md)
- [Deployment](docs/deployment.md)
- [Release Checklist](docs/release-checklist.md)

Architecture decisions:

- [ADR 0001: Web-first React + Vite architecture](docs/adr/0001-web-first-react-vite.md)
- [ADR 0002: Use Primer for GitHub-like UI](docs/adr/0002-primer-for-github-like-ui.md)
- [ADR 0003: Dexie-backed IndexedDB behind Repository contracts](docs/adr/0003-dexie-indexeddb-repository-layer.md)
- [ADR 0004: Keep domain logic as pure functions](docs/adr/0004-domain-logic-as-pure-functions.md)
- [ADR 0005: Cloudflare D1 recipe sharing MVP](docs/adr/0005-cloudflare-d1-recipe-sharing-mvp.md)
- [ADR 0006: Split public Recipe Alerts and private Inventory Audits](docs/adr/0006-split-recipe-alerts-and-inventory-audits.md)
- [ADR 0007: Stable User Handles for Repository URLs](docs/adr/0007-stable-user-handles-for-repository-urls.md)
- [ADR 0008: Clerk social authentication for the Cloud MVP](docs/adr/0008-clerk-social-auth-for-cloud-mvp.md)
- [ADR 0009: Hono for Worker routing](docs/adr/0009-hono-for-worker-routing.md)
- [ADR 0010: Explicit Inventory links for EOL Rescue](docs/adr/0010-explicit-inventory-links-for-eol-rescue.md)
- [ADR 0011: Granular dependency mutation API](docs/adr/0011-granular-dependency-mutation-api.md)
- [ADR 0012: Atomic recipe editor manifests](docs/adr/0012-atomic-recipe-editor-manifests.md)
- [ADR 0013: Atomic Repository Fork snapshots](docs/adr/0013-atomic-repository-fork-snapshots.md)

Requirements:

- [Cloud D1 requirements](docs/seasoningbom_requirements_cloud_d1.md)
- [Original local-first requirements](docs/requirements.md)

## Core Terms

| Cooking | Software joke |
| --- | --- |
| Recipe | Repository |
| Ingredient | Dependency |
| Ingredient inside another ingredient | Transitive dependency |
| Best-before date | EOL |
| Use-by date passed | Unsupported |
| Fridge inventory | Installed packages |
| Recipe audit | `nom audit` |
| Shopping list | `nom install` |
| Same-taste reproduction | `recipe-lock.json` |

## Safety Policy

SeasoningBOM uses software lifecycle jokes, but food safety behavior must remain conservative.

- Use-by date passed → `unsupported`
- User-marked dangerous item → `hazardous`
- `unsupported` and `hazardous` ingredients are excluded from recommendations
- The app must not encourage users to consume unsafe food

## License

This repository is licensed under the [MIT License](LICENSE).

In-app joke licenses such as "Mother's Taste License" are recipe metadata jokes and are not the source code license.
