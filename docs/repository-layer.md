# Repository Layer

SeasoningBOM は Web 先行の recipe sharing service です。

Cloud D1 MVP の production 永続化は Cloudflare D1 で行い、Cloudflare Workers API からアクセスします。既存の IndexedDB + Dexie.js 実装は local prototype / development adapter として残します。アプリケーション層は Repository contract または API client に依存し、具体的な DB 実装には依存しません。

## Goals

1. Workers / D1 実装を UI と domain から隠蔽する。
2. local prototype の IndexedDB 実装を差し替え可能にする。
3. ドメインロジックを DB から独立させる。
4. public Repository content と private Inventory data の境界を保つ。

## Repository Contracts

### Recipe Repository

```ts
type RecipeRepository = {
  findAll(): Promise<RecipeRepositoryEntity[]>;
  findById(id: string): Promise<RecipeRepositoryEntity | null>;
  findByOwnerAndSlug(ownerHandle: string, slug: string): Promise<RecipeRepositoryEntity | null>;
  save(recipe: RecipeRepositoryEntity): Promise<void>;
  delete(id: string): Promise<void>;
};
```

`slug` は owner handle 内でのみ一意です。Cloud D1 MVP の公開 API と route は stable `owner + slug` を正本にします。既存 IndexedDB プロトタイプの `findBySlug` は移行中の互換 API として扱います。

### Recipe Component Repository

```ts
type RecipeComponentRepository = {
  findByRecipeId(recipeId: string): Promise<RecipeComponent[]>;
  saveMany(recipeId: string, components: RecipeComponent[]): Promise<void>;
  deleteByRecipeId(recipeId: string): Promise<void>;
};
```

Rationale:

- レシピ本体と材料を分離して保存する。
- recipe editor では components をまとめて置き換える方が実装しやすい。
- P1 で dependency graph / search が増えても拡張しやすい。

### Inventory Repository

```ts
type InventoryRepository = {
  findAll(): Promise<InventoryItem[]>;
  findById(id: string): Promise<InventoryItem | null>;
  findByName(name: string): Promise<InventoryItem[]>;
  save(item: InventoryItem): Promise<void>;
  delete(id: string): Promise<void>;
};
```

Production API では、Inventory repository methods are scoped to the authenticated user. 他ユーザーの Inventory を owner 指定で直接読む contract は作りません。

### Settings Repository

```ts
type SettingsRepository = {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
};
```

### Backup Repository

```ts
type BackupRepository = {
  exportAll(): Promise<SeasoningBOMAppBackup>;
  importAll(
    backup: SeasoningBOMAppBackup,
    options: ImportOptions,
  ): Promise<ImportResult>;
};
```

Backup Repository は local prototype / data transfer 用です。Cloud D1 MVP の public SeasoningBOM export とは別物です。

```ts
type ImportOptions = {
  conflictStrategy: "overwrite" | "duplicate";
};

type ImportResult = {
  importedRepositories: number;
  importedComponents: number;
  importedInventoryItems: number;
  warnings: string[];
};
```

## Cloudflare D1 Implementation

Production implementation:

```text
src/repositories/cloudflare-d1/
  D1UserProfileRepository.ts
  D1RecipeRepository.ts
  D1RecipeComponentRepository.ts
  D1InventoryRepository.ts
  D1CookingLogRepository.ts
  D1RepositoryStarRepository.ts
  D1ContributionEvent.ts
  D1ContributionRepository.ts

src/workers/
  api/
  auth/
```

Core D1 tables:

```text
user_profiles
recipe_repositories
recipe_components
ingredient_dependencies
inventory_items
repository_stars
contribution_events
cooking_logs
```

Production rules:

- `recipe_repositories` has `UNIQUE(owner_user_id, slug)`.
- public Repository reads use `owner + slug`.
- `owner` in routes is the stable SeasoningBOM User Handle stored as `user_profiles.username`.
- User Handles cannot use app route roots such as `api`, `backup`, `eol`, `inventory`, `new`, `repositories`, `security`, or `users`.
- `user_profiles` is created through the profile bootstrap endpoint after a valid Clerk session.
- D1 Repository metadata list/detail/create is handled by `D1RecipeRepository` and Workers API handlers.
- Repository create/fork writes insert `recipe_created` and `repository_forked` rows into `contribution_events` in the same D1 batch as the `recipe_repositories` write. Repository updates insert `recipe_updated` only when name, slug, description, version, servings, README, or license changes; visibility-only or no-op updates do not create contribution events.
- Contribution events derived from private repositories are stored with event `visibility = "private"` even when the author's default contribution visibility is `public` or `summary_only`, so private repository names and slugs are not exposed in public day-level details.
- private Repository reads require the owner.
- unlisted Repository reads require the exact URL but are not listed publicly.
- Repository dependency reads and full-manifest replacements are handled by `D1RecipeComponentRepository` and exposed through `GET /api/repos/:owner/:repo/dependencies` and `PUT /api/repos/:owner/:repo/dependencies`.
- Repository dependency reads follow the same public / unlisted / private authorization boundary as repository metadata.
- Repository dependency replacements are owner-only and require Authorization bearer tokens. Clerk `__session` cookies are not accepted for this mutation.
- Repository dependency replacements are capped at 38 total component/dependency rows so the D1 batch stays within the free-tier query budget after auth/profile/repository lookups.
- SeasoningBOM export is generated on demand by `GET /api/repos/:owner/:repo/bom`; it is not stored in D1 and includes public Recipe Alerts only.
- Repository security reads are generated from repository content through `GET /api/repos/:owner/:repo/security`; they must not include Inventory Audit issues.
- Private Inventory Audit is generated by `POST /api/repos/:owner/:repo/audit` from a readable repository plus the authenticated viewer's `inventory_items`. MVP Cloud D1 uses `defaultSettings` for audit thresholds until user settings are added to the hosted data model.
- Repository stars are handled by `D1RepositoryStarRepository` and Workers API handlers.
- Repository forks create a new repository owned by the authenticated user and preserve the source repository through `recipe_repositories.source_repository_id`.
- `inventory_items` CRUD is handled by `D1InventoryRepository` and Workers API handlers.
- `inventory_items` are always scoped to the authenticated user; requests cannot choose another inventory owner.
- Inventory mutations require Authorization bearer tokens. Clerk `__session` cookies are limited to protected non-mutating reads until explicit CSRF handling is added.
- `cooking_logs` writes are handled by `D1CookingLogRepository` and exposed through `POST /api/repos/:owner/:repo/cooking-logs`.
- Creating a cooking log also inserts a `cooking_logged` row into `contribution_events` in the same D1 batch.
- Cooking log reads follow repository visibility first, then log-author privacy: public visitors only see logs from users with `contribution_visibility = "public"`; signed-in users can additionally see their own logs.
- Cooking log mutations require Authorization bearer tokens. Clerk `__session` cookies are not accepted for cooking-log writes.
- Profile contribution reads are handled by `D1ContributionRepository` and exposed through `GET /api/users/:username/profile`, `GET /api/users/:username/contributions`, and `GET /api/users/:username/contributions/:date`.
- Contribution graph counts are visible for `public` and `summary_only` profiles; `private` contribution graphs are owner-only.
- Contribution day event details are visible to the owner and to third parties only when the profile is `public`; `summary_only` third-party reads return counts without events.
- Recipe Alert queries may use Repository content only.
- Inventory Audit queries may combine Repository content with only the viewer's Inventory.
- D1 bindings and SQL stay inside Workers / repository implementation.
- Clerk owns sign-in, sessions, and account linking. SeasoningBOM-owned tables reference `user_profiles`, not provider usernames, email addresses, or Clerk display names directly.

## IndexedDB Prototype Implementation

Local prototype implementation:

```text
src/repositories/indexeddb/
  IndexedDbRecipeRepository.ts
  IndexedDbRecipeComponentRepository.ts
  IndexedDbInventoryRepository.ts
  IndexedDbSettingsRepository.ts
  IndexedDbBackupRepository.ts
```

Dexie database:

```ts
class SeasoningBomDb extends Dexie {
  recipeRepositories!: Table<RecipeRepositoryEntity, string>;
  recipeComponents!: Table<RecipeComponent, string>;
  inventoryItems!: Table<InventoryItem, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("SeasoningBOM");

    this.version(1).stores({
      recipeRepositories: "id, slug, name, updatedAt",
      recipeComponents: "id, recipeId, ingredientName",
      inventoryItems: "id, name, category, bestBeforeDate, useByDate",
      settings: "id",
    });
  }
}
```

## React Binding

Production Cloud D1 MVP では API client / loader hooks から Workers API を呼びます。Local prototype では `dexie-react-hooks` の `useLiveQuery` を使い、DB 更新を UI に反映します。

Example shape:

```ts
const recipes = useLiveQuery(
  () => recipeRepository.findAll(),
  [],
  [],
);
```

Policy:

- local prototype の DB 変更購読は `useLiveQuery` で十分。
- 複雑な UI 状態が増えた場合のみ Context / Zustand を検討する。

## Memory Repository

テストや Storybook 的な UI 確認用に memory implementation を用意します。

```text
src/repositories/memory/
  MemoryRecipeRepository.ts
  MemoryInventoryRepository.ts
```

Use cases:

- unit / component tests
- example data
- UI development without IndexedDB setup

## Transaction Policy

D1 / Dexie 実装では、複数 entity を更新する操作は transaction にまとめます。

Examples:

- レシピ削除時に components も削除する。
- backup import 時に複数 store を一括更新する。

local prototype の recipe editor は `RecipeRepository.save` と `RecipeComponentRepository.saveMany` を順に呼びます。Cloud D1 MVP では repository metadata / components / dependency rows の保存を API layer で atomic に扱います。

## Import Conflict Policy

local prototype では import 時の conflict strategy は次の 2 つです。

### `overwrite`

同じ `id` の既存データを置き換えます。

Use case:

- 自分のバックアップを復元する。

### `duplicate`

既存データと衝突する場合、新しい ID を発行して別データとして取り込みます。

Use case:

- 他人のレシピデータを取り込む。

## Repository Layer Rules

Do:

- DB へのアクセスは Repository 経由にする。
- D1 固有の処理は `repositories/cloudflare-d1` / `workers` に閉じ込める。
- IndexedDB 固有の処理は `repositories/indexeddb` に閉じ込める。
- import 前に backup schema を検証する。
- 書き込み時に `updatedAt` を更新する。

Do not:

- React component から Dexie table を直接触らない。
- React component から D1 binding を直接触らない。
- domain function から Repository を呼ばない。
- lifecycle status を DB に保存しない。
- SeasoningBOM snapshot を DB に保存しない。
- Inventory Audit issue を public Repository response や SeasoningBOM に混ぜない。
