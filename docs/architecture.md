# Architecture

SeasoningBOM は、React + Vite + TypeScript による Web 先行アプリとして設計します。

Cloud D1 MVP では Cloudflare Pages でフロントエンドを配信し、Cloudflare Workers API と D1 で hosted recipe sharing service を実装します。既存の IndexedDB 実装は local prototype / development adapter として残し、アプリケーション層からは Repository contract または API client 越しにアクセスします。

## Technology Decisions

| Area | Decision |
| --- | --- |
| Language | TypeScript |
| UI | React |
| Build | Vite |
| UI library | `@primer/react` |
| Icons | Temporary internal SVG placeholders |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers + Hono |
| Production DB | Cloudflare D1 |
| Auth | Clerk social login |
| Local prototype storage | IndexedDB |
| Local prototype DB wrapper | Dexie.js |
| Local prototype React binding | `dexie-react-hooks` / `useLiveQuery` |
| Package manager | pnpm |
| Lint / Format | Biome |
| Test | Vitest + Testing Library |
| CI | GitHub Actions |
| License | MIT |

## High-Level Layers

```text
src/
  app/
    routes/
    providers/
    layout/

  features/
    recipes/
    inventory/
    audit/
    backup/

  domain/
    recipe/
    inventory/
    lifecycle/
    audit/
    seasoning-bom/

  repositories/
    contracts/
    cloud-api/
    cloudflare-d1/
    indexeddb/
    memory/

  db/
    schema/
    migrations/

  workers/
    api/
    auth/

  ui/
    github/
    components/
    theme/

  test/
    factories/
    fixtures/
```

## Layer Responsibilities

### `domain/`

UI や DB に依存しないドメインロジックを置きます。

Examples:

- lifecycle status 判定
- Recipe Alert generation
- Inventory Audit generation
- SeasoningBOM 生成
- recipe recommendation
- dependency graph traversal
- backup schema validation

Rules:

- React を import しない。
- Dexie を import しない。
- 現在日時は直接 `new Date()` せず、呼び出し側から `now` を受け取る。
- テストを厚めに書く。

### `repositories/contracts/`

永続化の抽象インターフェースを定義します。

Examples:

- `RecipeRepository`
- `InventoryRepository`
- `SettingsRepository`
- `BackupRepository`

Rules:

- UI は具体的な D1 / IndexedDB 実装ではなく contract または API client に依存する。
- production D1 adapter と local IndexedDB adapter で同じドメイン境界を保つ。

### `repositories/cloudflare-d1/` / `workers/`

Cloudflare Workers API と D1 向けの production 実装を置きます。Workers API の routing は Hono で定義し、route handler は D1 repository と auth helper に処理を委譲します。

Examples:

- `D1RecipeRepository`
- `D1InventoryRepository`
- `D1ContributionRepository`
- Clerk session verification helper

Rules:

- D1 binding や SQL は Workers / repository implementation に閉じ込める。
- private repository / private inventory の authorization を API layer で必ず確認する。
- Repository identity は stable User Handle の `owner + slug` を正本にする。
- Authentication は Clerk に委譲し、Workers API は Clerk session token を検証して `user_profiles` に対応付ける。
- Clerk session verification uses `@clerk/backend` with `CLERK_JWT_KEY` and a comma-separated `CLERK_AUTHORIZED_PARTIES` allowlist for expected frontend origins. Verified tokens must include a non-empty Clerk user subject, session id, and allowed `azp` claim.
- Protected mutation routes require an Authorization bearer token. Clerk `__session` cookies are accepted only for protected non-mutating reads until explicit CSRF handling is added.
- SeasoningBOM では email/password、SMS login、password reset flow を実装しない。

### `repositories/indexeddb/`

Dexie を使った local prototype / development adapter を置きます。

Examples:

- `IndexedDbRecipeRepository`
- `IndexedDbInventoryRepository`
- `IndexedDbBackupRepository`

Rules:

- Dexie 固有の API はここに閉じ込める。
- migration は `db/` 配下に寄せる。
- Cloud D1 MVP の production behavior と異なる場合は docs か ADR に明記する。

### `features/`

画面やユーザー操作に近い単位の実装を置きます。

Examples:

- `features/recipes`
- `features/inventory`
- `features/audit`
- `features/backup`

Rules:

- 表示・入力・ユーザー操作を扱う。
- ドメインロジックは `domain/` に委譲する。
- DB 操作は Repository contract を通す。

### `ui/`

汎用 UI コンポーネントと GitHub 風 UI ラッパーを置きます。

Examples:

- Repository header
- Repository tabs
- Security alert list
- Dependency tree
- Code block
- GitHub-like label

Rules:

- Primer コンポーネントの直接利用を局所化する。
- 見た目だけのコンポーネントにドメインロジックを持ち込まない。

## Data Flow

```text
User action
  ↓
React feature component
  ↓
Repository contract
  ↓
Workers API / local prototype adapter
  ↓
React data binding observes changes
  ↓
React re-renders
```

For computed outputs:

```text
Recipe Repository + optional viewer Inventory + now
  ↓
domain pure function
  ↓
RecipeAlert / InventoryAudit / SeasoningBOM / Recommendation
  ↓
UI rendering
```

## Dependency Direction

Allowed dependency direction:

```text
features → domain
features → repositories/contracts
features → ui
repositories/indexeddb → repositories/contracts
repositories/indexeddb → db
ui → domain types only when needed
domain → no app/framework/db dependencies
```

Forbidden:

- `domain` importing `react`
- `domain` importing `dexie`
- `domain` reading browser storage
- UI directly creating SeasoningBOM JSON by assembling ad-hoc objects
- UI directly calculating lifecycle status

## Runtime Boundaries

The MVP intentionally uses one `package.json` for the browser app, Worker API, and shared pure modules. Runtime separation is enforced by TypeScript project references and `pnpm run check:boundaries`, not by separate workspace packages.

- `tsconfig.app.json` typechecks browser/React code and excludes Worker/D1 implementations.
- `tsconfig.worker.json` typechecks Workers and D1 repositories with Web Worker globals instead of DOM globals.
- frontend code cannot import Workers, D1 repositories, Hono, or `@clerk/backend`.
- Worker/D1 code cannot import React UI, Dexie, IndexedDB repositories, or the browser API client.
- `domain/` cannot import UI, repositories, Workers, browser storage, or runtime frameworks.

`pnpm run check` runs the boundary check and both runtime typechecks. Keep these rules mechanical when adding a new source layer or runtime-specific dependency.

## MVP Route Structure

Cloud D1 MVP route plan:

| Route | Purpose |
| --- | --- |
| `/` | Public / signed-in landing and repository discovery |
| `/:owner/:repo` | GitHub-style recipe repository detail |
| `/:owner/:repo/edit` | Recipe editor for authorized users |
| `/:owner/:repo/dependencies` | Repository dependency graph entry point |
| `/:owner/:repo/security` | Repository public recipe alerts and owner inventory audit entry point |
| `/new` | Create repository |
| `/inventory` | Signed-in user's private inventory |
| `/users/:username` | Profile and contribution graph |

Legacy prototype routes under `/repositories/:slug` may exist during migration, but they are not canonical for the cloud MVP.

## Error Handling Policy

MVP は hosted service なので、エラーは次の方針で扱います。

- User input validation error: UI 上で即時表示する。
- Auth / authorization error: ログイン、権限、visibility のどれが原因かを安全に表示する。
- API / D1 error: ユーザーに再試行を促し、秘密情報や private inventory を漏らさない。
- Domain impossible state: 開発時にテストで防ぎ、実行時は安全側に fallback する。

## Testing Strategy

### Unit tests

最優先:

- lifecycle status
- `nom audit`
- SeasoningBOM generation
- dependency graph traversal
- backup import validation

### Component tests

MVP で必要:

- Repository tabs
- Security alerts rendering
- Dependency list rendering
- Recipe editor validation

### E2E tests

MVP 後半で追加:

- レシピ作成 → 保存 → 再読込
- inventory 登録 → `nom audit`
- SeasoningBOM download
- backup export/import
