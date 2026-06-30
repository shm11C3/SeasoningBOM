# Domain Logic

SeasoningBOM の中核ロジックは UI や DB から独立した純粋関数として実装します。

対象:

- lifecycle status 判定
- `nom audit`
- レシピ提案
- SeasoningBOM 生成
- `nom install` 買い物リスト生成

## Lifecycle Status

食材の状態は `InventoryItem` の日付と `hazardous` から都度計算します。DB には保存しません。

```ts
type LifecycleStatus =
  | "active"
  | "deprecated"
  | "eol"
  | "unsupported"
  | "hazardous";
```

## Lifecycle Priority

複数条件に該当する場合は、より危険な状態を優先します。

```text
hazardous > unsupported > eol > deprecated > active
```

## Lifecycle Rules

| Status | Rule | User-facing label | Behavior |
| --- | --- | --- | --- |
| `active` | EOL まで 4 日以上 | Supported | 通常利用可能 |
| `deprecated` | EOL まで 1〜3 日 | Deprecated | 早めの利用を推奨 |
| `eol` | 賞味期限切れ | EOL | 注意表示 |
| `unsupported` | 消費期限切れ | Unsupported | 利用推奨しない |
| `hazardous` | ユーザーが危険フラグを付けた | Critical | 利用不可扱い |

## Lifecycle Function Shape

```ts
type CalculateLifecycleStatusInput = {
  item: InventoryItem;
  now: Date;
  deprecatedThresholdDays: number;
};

function calculateLifecycleStatus(
  input: CalculateLifecycleStatusInput,
): LifecycleStatus;
```

Rules:

- `hazardous` が true なら常に `hazardous`。
- `useByDate` が `now` より前なら `unsupported`。
- `bestBeforeDate` が `now` より前なら `eol`。
- `bestBeforeDate` までの日数が threshold 以下なら `deprecated`。
- それ以外は `active`。

## Date Comparison Policy

`bestBeforeDate` と `useByDate` は日付単位で比較します。

Example:

- `now = 2026-07-01T14:00:00+09:00`
- `bestBeforeDate = 2026-07-01`

この場合は当日なので、まだ `eol` ではありません。`2026-07-02` になってから `eol` とします。

## `nom audit`

`nom audit` は、レシピと冷蔵庫インベントリを照合し、問題を検出するドメイン機能です。

```ts
type NomAuditInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  now: Date;
  settings: AppSettings;
};

type AuditResult = {
  recipeId: string;
  generatedAt: string;
  summary: AuditSummary;
  issues: AuditIssue[];
};
```

## Audit Issue

```ts
type AuditIssue = {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  componentName?: string;
  inventoryItemId?: string;
  message: string;
  recommendation?: string;
};

type AuditSeverity = "low" | "medium" | "high" | "critical";

type AuditCategory =
  | "eol"
  | "unsupported"
  | "hazardous"
  | "allergen"
  | "missing"
  | "transitive-dependency"
  | "substitute"
  | "license";
```

## Severity Rules

| Severity | Conditions |
| --- | --- |
| `low` | 注意情報、任意材料不足、軽微な推移的依存情報 |
| `medium` | EOL 間近、代替材料なし |
| `high` | 賞味期限切れ、主要材料不足 |
| `critical` | 消費期限切れ、hazardous、重大アレルゲン |

## Audit Checks

### 1. Missing dependency check

レシピ材料に対応する inventory item がない場合に issue を出します。

- required component missing → `high`
- optional component missing → `low`

### 2. Quantity check

同一単位で inventory quantity が recipe quantity 未満の場合に issue を出します。

- required shortage → `high`
- optional shortage → `low`
- unit が異なる場合は MVP では比較不能として `low` の注意に留める。

### 3. Lifecycle check

inventory item の lifecycle status に応じて issue を出します。

| Status | Severity |
| --- | --- |
| `deprecated` | `medium` |
| `eol` | `high` |
| `unsupported` | `critical` |
| `hazardous` | `critical` |

### 4. Allergen check

component と transitive dependency の allergen を検出します。

MVP ではユーザーごとのアレルゲンプロファイルは持たず、「含まれている」ことを security alert 風に表示します。

P1 以降で `blockedAllergens` 設定を追加できます。

### 5. Transitive dependency check

直接材料が内部依存を持つ場合に表示します。

Example:

```text
LOW curry-roux contains transitive dependency: wheat
```

### 6. Substitute check

required component が不足しており alternatives が設定されている場合、代替候補を recommendation に含めます。

### 7. License joke check

`license` が `Secret Sauce`, `Mother's Taste License` などの場合、再利用注意を low issue として出すことがあります。

これはネタ表示であり、実際の OSS ライセンス判定ではありません。

## Audit Output Example

```text
nom audit found 4 issues.

HIGH      tofu@300g has reached EOL
MEDIUM    milk@1L will reach EOL in 1 day
LOW       curry-roux contains transitive dependency: wheat
CRITICAL  chicken@200g is unsupported
```

## Recommendation Logic

EOL 間近の食材を優先して使えるレシピを提案します。

```ts
type RecipeRecommendation = {
  recipeId: string;
  score: number;
  matchedDeprecatedItems: InventoryItem[];
  excluded: boolean;
  exclusionReasons: string[];
};
```

MVP score factors:

- `deprecated` item を使う: +10
- `eol` item を使う: +3（注意扱い）
- missing required item: -20
- unsupported item を使う: excluded
- hazardous item を使う: excluded

Important:

- `unsupported` / `hazardous` を含むレシピは推奨候補から除外する。
- 食品安全を犠牲にしてジョークを優先しない。

## `nom install`

不足材料を買い物リスト化する機能です。

```ts
type ShoppingListItem = {
  ingredientName: string;
  requiredQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
  unit: Unit;
  alternatives: string[];
  reason: "missing" | "insufficient";
};
```

MVP:

- 同一単位で不足量を算出する。
- 単位が異なる場合は必要量全体を missing として扱い、注意文を出す。
- unsupported / hazardous 在庫は available として扱わない。

## SeasoningBOM Generation

SeasoningBOM はレシピ詳細画面から都度生成する snapshot です。DB には保存しません。

```ts
type GenerateSeasoningBOMInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  audit: AuditResult;
  generatedAt: Date;
};
```

Rules:

- `bomFormat` は `"SeasoningBOM"`。
- `specVersion` は `"0.1.0"`。
- direct dependencies と transitive dependencies を含める。
- lifecycle status は生成時点の snapshot として含める。
- audit result も snapshot として含める。

## Pure Function Rule

以下の関数はすべて純粋関数として実装します。

- `calculateLifecycleStatus`
- `runNomAudit`
- `generateSeasoningBOM`
- `generateShoppingList`
- `recommendRecipes`

Do:

- inputs をすべて引数で受け取る。
- `now` を引数で受け取る。
- 同じ input に対して同じ output を返す。

Do not:

- 関数内で DB を読む。
- 関数内で `Date.now()` を直接呼ぶ。
- 関数内で UI を操作する。

