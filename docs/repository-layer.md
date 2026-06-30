# Repository Layer

SeasoningBOM は Web 先行のローカルファーストアプリです。

MVP の永続化は IndexedDB + Dexie.js で行います。ただし、将来のモバイル版では SQLite を使う想定のため、アプリケーション層は Repository contract に依存し、具体的な DB 実装には依存しません。

## Goals

1. Web の IndexedDB 実装を隠蔽する。
2. 将来の SQLite 実装を差し替え可能にする。
3. ドメインロジックを DB から独立させる。
4. backup / restore を store 単位で扱いやすくする。

## Repository Contracts

### Recipe Repository

```ts
type RecipeRepository = {
  findAll(): Promise<RecipeRepositoryEntity[]>;
  findById(id: string): Promise<RecipeRepositoryEntity | null>;
  findBySlug(slug: string): Promise<RecipeRepositoryEntity | null>;
  save(recipe: RecipeRepositoryEntity): Promise<void>;
  delete(id: string): Promise<void>;
};
```

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

## IndexedDB Implementation

MVP implementation:

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

React 側では `dexie-react-hooks` の `useLiveQuery` を使い、DB 更新を UI に反映します。

Example shape:

```ts
const recipes = useLiveQuery(
  () => recipeRepository.findAll(),
  [],
  [],
);
```

Policy:

- MVP では TanStack Query は使わない。
- ローカル DB の変更購読は `useLiveQuery` で十分。
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

Dexie 実装では、複数 store を更新する操作は transaction にまとめます。

Examples:

- レシピ削除時に components も削除する。
- recipe editor 保存時に recipe と components を同時更新する。
- backup import 時に複数 store を一括更新する。

## Import Conflict Policy

MVP では import 時の conflict strategy は次の 2 つです。

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
- IndexedDB 固有の処理は `repositories/indexeddb` に閉じ込める。
- import 前に backup schema を検証する。
- 書き込み時に `updatedAt` を更新する。

Do not:

- React component から Dexie table を直接触らない。
- domain function から Repository を呼ばない。
- lifecycle status を DB に保存しない。
- SeasoningBOM snapshot を DB に保存しない。

