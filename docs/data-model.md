# Data Model

SeasoningBOM のデータモデルは、料理を Repository、材料を Dependencies、賞味期限を EOL として扱うためのドメインモデルです。

MVP では IndexedDB に保存しますが、データモデル自体は永続化方式に依存しません。

## Entity Overview

```text
RecipeRepositoryEntity
  ├── RecipeComponent[]
  │     └── IngredientDependency[]
  └── RecipeRelease[]       (P1)

InventoryItem

AppSettings
```

## Recipe Repository

料理レシピを GitHub Repository 風に表現する単位です。

```ts
type RecipeRepositoryEntity = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  version: string;
  servings: number;
  tags: string[];
  license?: string;
  maintainer?: string;
  readme?: string;
  createdAt: string;
  updatedAt: string;
};
```

### Field Notes

| Field | Meaning |
| --- | --- |
| `id` | 内部 ID。UUID を想定 |
| `name` | 表示名。例: `Curry Rice` |
| `slug` | URL / ファイル名向け識別子。例: `curry-rice` |
| `description` | Repository description |
| `version` | レシピバージョン。SemVer 風文字列 |
| `servings` | 何人分か |
| `tags` | `budget`, `eol-rescue`, `japanese` など |
| `license` | ネタ用。例: `Mother's Taste License` |
| `maintainer` | 作成者 |
| `readme` | README 風の説明文 |

## Recipe Component

レシピが必要とする材料です。直接依存、任意依存、相性依存、代替材料などを表現します。

```ts
type RecipeComponent = {
  id: string;
  recipeId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: Allergen[];
  alternatives: string[];
  transitiveDependencies: IngredientDependency[];
  notes?: string;
};
```

### Field Notes

| Field | Meaning |
| --- | --- |
| `recipeId` | 所属する Recipe Repository |
| `ingredientName` | 材料名 |
| `quantity` | 必要量 |
| `unit` | 単位 |
| `dependencyType` | `required`, `optional`, `peer` など |
| `required` | MVP の UI で扱いやすくするための boolean |
| `allergens` | 直接材料としてのアレルゲン |
| `alternatives` | 代替材料名 |
| `transitiveDependencies` | 内部に含まれる依存材料 |

## Ingredient Dependency

材料内部の依存、代替、相性依存を表します。

```ts
type IngredientDependency = {
  name: string;
  dependencyType: "transitive" | "substitute" | "peer";
  allergens: Allergen[];
  notes?: string;
};
```

Example:

```ts
{
  name: "curry-roux",
  dependencyType: "required",
  transitiveDependencies: [
    { name: "wheat", dependencyType: "transitive", allergens: ["wheat"] },
    { name: "milk", dependencyType: "transitive", allergens: ["milk"] }
  ]
}
```

## Inventory Item

冷蔵庫・食品庫にある食材です。

```ts
type InventoryItem = {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  bestBeforeDate?: string;
  useByDate?: string;
  hazardous: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Field Notes

| Field | Meaning |
| --- | --- |
| `bestBeforeDate` | 賞味期限。EOL 判定に使う |
| `useByDate` | 消費期限。過ぎていれば unsupported |
| `hazardous` | ユーザーが危険フラグを付けた状態 |

## Lifecycle Status

`LifecycleStatus` は DB に保存しません。日付と `hazardous` から都度計算します。

```ts
type LifecycleStatus =
  | "active"
  | "deprecated"
  | "eol"
  | "unsupported"
  | "hazardous";
```

Priority:

1. `hazardous`
2. `unsupported`
3. `eol`
4. `deprecated`
5. `active`

## Dependency Type

```ts
type DependencyType =
  | "required"
  | "optional"
  | "dev"
  | "peer"
  | "transitive"
  | "substitute";
```

| Type | Meaning | Example |
| --- | --- | --- |
| `required` | 必須材料 | 米、ルー |
| `optional` | 任意材料 | チーズ、福神漬け |
| `dev` | 調理補助 | 計量スプーン、圧力鍋 |
| `peer` | 相性依存 | カレーに対する米 |
| `transitive` | 材料内部の依存 | ルーに含まれる小麦 |
| `substitute` | 代替材料 | 牛乳の代わりに豆乳 |

## Units

MVP では厳密な単位換算は対象外です。単位は表示・不足判定のための文字列 enum として扱います。

```ts
type Unit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "piece"
  | "pack"
  | "box"
  | "tbsp"
  | "tsp"
  | "cup"
  | "go"
  | "pinch"
  | "as_needed";
```

### Unit Policy

- MVP の不足判定は同一単位同士のみ比較する。
- 異なる単位間の換算は P1 以降。
- `as_needed` は量比較をしない。

## Allergen

MVP では主要アレルゲンを string literal union として扱います。

```ts
type Allergen =
  | "egg"
  | "milk"
  | "wheat"
  | "buckwheat"
  | "peanut"
  | "shrimp"
  | "crab"
  | "soy"
  | "beef"
  | "pork"
  | "chicken"
  | "fish"
  | "other";
```

## App Settings

```ts
type AppSettings = {
  id: "default";
  deprecatedThresholdDays: number;
  preferredTheme: "light" | "dark" | "system";
  defaultMaintainer?: string;
  updatedAt: string;
};
```

MVP default:

```ts
{
  id: "default",
  deprecatedThresholdDays: 3,
  preferredTheme: "system"
}
```

## Backup Format

全データエクスポート用の形式です。

```ts
type SeasoningBOMAppBackup = {
  format: "SeasoningBOMAppBackup";
  version: "0.1.0";
  exportedAt: string;
  repositories: RecipeRepositoryEntity[];
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  settings: AppSettings;
};
```

## Normalization Policy

IndexedDB では次の store を想定します。

```text
recipeRepositories
recipeComponents
inventoryItems
settings
```

Reasoning:

- レシピ本体と材料を分けることで、材料の検索や audit がしやすい。
- `RecipeComponent.transitiveDependencies` は MVP では embedded array とする。
- 将来、材料メタデータが増えたら `ingredientMetadata` store に分離する。

## Date Policy

- 日付文字列は ISO 8601 を使う。
- `bestBeforeDate` / `useByDate` は `YYYY-MM-DD`。
- `createdAt` / `updatedAt` / `generatedAt` は ISO datetime。
- lifecycle 判定は呼び出し側から `now` を渡して決定する。

