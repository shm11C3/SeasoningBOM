# SeasoningBOM レシピアプリ 要件一覧

## 1. コンセプト

本アプリは、料理レシピをソフトウェアリポジトリのように扱う、ネタ寄りのローカルファーストなレシピ管理アプリである。

レシピに含まれる材料をコンポーネントとして管理し、賞味期限を EOL として扱い、直接依存および推移的依存を SBOM 風に出力できることを目的とする。

実用面では、冷蔵庫内の食材管理、EOL 間近の食材を使ったレシピ提案、アレルゲンや期限切れ食材の監査を行う。

ネタ面では、料理を Repository、材料を Dependencies、賞味期限を EOL、監査を `nom audit`、買い物リスト生成を `nom install` として表現する。

UI は GitHub 風とし、レシピ詳細を Repository ページ、材料一覧を Dependency graph、EOL 警告を Security alerts、変更履歴を Releases / CHANGELOG のように見せる。

## 2. 基本方針

| 項目 | 方針 |
|---|---|
| サーバー DB | 持たない |
| Web 版の保存先 | IndexedDB などのブラウザ内 local DB |
| モバイル版の保存先 | SQLite |
| データ同期 | MVP では対象外 |
| アカウント機能 | MVP では対象外 |
| SBOM | 本物の SPDX / CycloneDX 完全互換ではなく、SBOM 風 JSON とする |
| 安全性 | 消費期限切れ食材の利用を推奨しない |
| UI テーマ | GitHub 風 |
| ネタの方向性 | 食品ロス対策をソフトウェアサプライチェーン管理の顔で表現する |

## 3. 用語

| 用語 | 意味 |
|---|---|
| Recipe Repository | 料理レシピを管理するリポジトリ風の単位 |
| Recipe | 具体的な料理 |
| Component | レシピに含まれる材料 |
| Direct Dependency | レシピが直接必要とする材料 |
| Transitive Dependency | 材料が内部的に含む別の材料 |
| EOL | 賞味期限 |
| Unsupported | 消費期限切れ |
| nom audit | レシピ監査機能 |
| nom install | 不足材料から買い物リストを作る機能 |
| nom outdated | EOL 間近または EOL 済み食材を表示する機能 |
| SeasoningBOM | 本アプリ独自の SBOM 風出力形式 |
| recipe-lock.json | 同じ味を再現するための材料ロックファイル |
| Security alerts | アレルゲン、EOL、Unsupported 食材などの警告 |
| Releases | レシピのバージョン履歴 |
| Issues | 食材やレシピに関する注意事項、改善メモ、期限警告 |

## 4. 機能要件一覧

### P0: MVP 必須

| ID | 要件 |
|---|---|
| P0-1 | ユーザーはレシピを登録、編集、削除できる |
| P0-2 | レシピには名前、バージョン、人数、材料、手順を設定できる |
| P0-3 | レシピの材料には分量、単位、必須かどうか、代替材料、アレルゲンを設定できる |
| P0-4 | ユーザーは冷蔵庫インベントリとして食材を登録、編集、削除できる |
| P0-5 | 食材には名前、カテゴリ、残量、単位、賞味期限、消費期限を設定できる |
| P0-6 | 賞味期限を EOL として扱い、ライフサイクル状態を自動判定できる |
| P0-7 | 消費期限切れの食材は Unsupported として扱い、利用推奨しない |
| P0-8 | レシピ詳細画面から SeasoningBOM JSON をダウンロードできる |
| P0-9 | `nom audit` により、EOL 間近、EOL 済み、Unsupported、アレルゲン、不足材料を検出できる |
| P0-10 | EOL 間近の食材を優先して使えるレシピを提案できる |
| P0-11 | Web 版は IndexedDB などの local DB にデータを保存できる |
| P0-12 | モバイル版は SQLite にデータを保存できる |
| P0-13 | ストレージ差分は Repository 層で隠蔽できる |
| P0-14 | 全データを JSON としてエクスポートできる |
| P0-15 | エクスポート済み JSON からデータをインポートできる |
| P0-16 | レシピを Repository として表現し、直接依存材料を表示できる |
| P0-17 | 材料が持つ推移的依存を表示できる |
| P0-18 | SeasoningBOM に直接依存と推移的依存を含められる |
| P0-19 | レシピ詳細画面を GitHub の Repository ページ風に表示できる |
| P0-20 | レシピ画面には Code、Dependencies、Security、Releases 相当のタブを表示できる |
| P0-21 | EOL 警告とアレルゲン警告を GitHub の Security alerts 風に表示できる |
| P0-22 | 不足材料を `nom install` 結果として買い物リスト化できる |

### P1: MVP 後に追加

| ID | 要件 |
|---|---|
| P1-1 | レシピのバージョン履歴を表示できる |
| P1-2 | レシピ変更差分を表示できる |
| P1-3 | `recipe-lock.json` を出力できる |
| P1-4 | 材料依存関係ツリーを UI で表示できる |
| P1-5 | `nom audit` の結果を履歴として保存できる |
| P1-6 | EOL カレンダーを表示できる |
| P1-7 | SNS 共有用の監査結果画像を生成できる |
| P1-8 | レシピ Repository の README 風表示を追加できる |
| P1-9 | レシピに tag、license、maintainer を設定できる |
| P1-10 | Issues 風に「牛乳 EOL 間近」「卵の在庫不足」などを表示できる |
| P1-11 | Pull Request 風にレシピ改善案を表示できる |
| P1-12 | Releases 風にレシピのバージョンごとの差分を表示できる |
| P1-13 | Dependency graph 風に材料の依存関係を可視化できる |

### P2: ネタ強化、将来拡張

| ID | 要件 |
|---|---|
| P2-1 | レシピを GitHub リポジトリ風 UI でさらに精密に表示できる |
| P2-2 | Discussions 風に調理メモや味の改善案を管理できる |
| P2-3 | Actions 風に調理手順の進捗を表示できる |
| P2-4 | CHANGELOG 風にレシピ変更履歴を表示できる |
| P2-5 | `nom outdated` 風に EOL 間近食材一覧を表示できる |
| P2-6 | `nom dedupe` 風に重複食材を統合できる |
| P2-7 | `nom ci` 風に recipe-lock.json に従って厳密な買い物リストを生成できる |
| P2-8 | バーコード読み取りに対応できる |
| P2-9 | レシート OCR に対応できる |
| P2-10 | クラウド同期に対応できる |

## 5. ライフサイクル状態

賞味期限、消費期限、危険フラグから食材の状態を判定する。

| 状態 | 条件 | 表示例 | 扱い |
|---|---|---|---|
| active | EOL まで 4 日以上 | Supported | 通常利用可能 |
| deprecated | EOL まで 1 から 3 日 | Deprecated | 早めの利用を推奨 |
| eol | 賞味期限切れ | EOL | 注意表示 |
| unsupported | 消費期限切れ | Unsupported | 利用推奨しない |
| hazardous | ユーザーが危険フラグを付けた | Critical | 利用不可扱い |

補足:

- `status` は DB に保存せず、日付から都度計算する。
- `hazardous` はユーザーが手動で付ける危険フラグとする。
- 消費期限切れはネタ表現にしても安全側に倒す。
- `unsupported` と `hazardous` の食材を使うレシピは推奨候補から除外する。

## 6. Repository としての料理表現

レシピは GitHub Repository のように表現する。

例:

```text
owner: me
repository: curry-rice
description: 家庭用カレーライスの安定版レシピ
version: v1.2.0
license: Mother's Taste License
maintainer: me
stars: 42
forks: 3
```

Repository には以下の情報を持たせる。

| 項目 | 内容 |
|---|---|
| name | レシピ名 |
| slug | URL やファイル名向け識別子 |
| description | 説明 |
| version | レシピバージョン |
| servings | 人数 |
| tags | 和食、洋食、節約、EOL 救済など |
| license | ネタ用ライセンス |
| maintainer | 作成者 |
| readme | README 風の説明文 |
| components | 材料一覧 |
| steps | 調理手順 |

## 7. 依存関係要件

### 7.1 直接依存

レシピが直接必要とする材料を Direct Dependencies として扱う。

例:

```text
curry-rice@1.2.0
├── rice@2go
├── curry-roux@half-box
├── potato@3pieces
├── carrot@1piece
├── onion@2pieces
└── pork@300g
```

### 7.2 推移的依存

材料が内部的に含む別の材料を Transitive Dependencies として扱う。

例:

```text
curry-rice@1.2.0
└── curry-roux@half-box
    ├── wheat
    ├── milk
    ├── soy
    ├── beef-fat
    └── spices
```

用途:

- アレルゲン検出
- SeasoningBOM 出力
- Dependency graph 表示
- `nom audit` の監査
- 「この料理、依存関係が深すぎる」というネタ表示

### 7.3 依存の種類

| 種類 | 意味 | 例 |
|---|---|---|
| required | 必須材料 | 米、ルー |
| optional | 任意材料 | 福神漬け、チーズ |
| dev | 調理補助 | 計量スプーン、圧力鍋 |
| peer | 相性依存 | カレーに対する米 |
| transitive | 材料内部の依存 | ルーに含まれる小麦 |
| substitute | 代替材料 | 牛乳の代わりに豆乳 |

## 8. nom audit 要件

`nom audit` は、レシピと冷蔵庫インベントリを照合して問題を検出する。

### 8.1 監査項目

| 項目 | 内容 |
|---|---|
| EOL 監査 | 材料が EOL 間近または EOL 済みではないか |
| Unsupported 監査 | 消費期限切れ食材が含まれていないか |
| Hazardous 監査 | 危険フラグ付き食材が含まれていないか |
| アレルゲン監査 | 卵、乳、小麦などを含むか |
| 不足材料監査 | 冷蔵庫にない材料がないか |
| 推移的依存監査 | 直接材料の内部依存にアレルゲンなどがないか |
| 代替可能性監査 | 代替食材が設定されているか |
| ライセンス監査 | 秘伝のタレ、母の味などの再利用注意を表示する |

### 8.2 監査結果表示

例:

```text
nom audit found 4 issues.

HIGH      tofu@300g has reached EOL
MEDIUM    milk@1L will reach EOL in 1 day
LOW       curry-roux contains transitive dependency: wheat
CRITICAL  chicken@200g is unsupported
```

### 8.3 Severity

| Severity | 条件 |
|---|---|
| low | 注意情報、任意材料不足、軽微な依存情報 |
| medium | EOL 間近、代替材料なし |
| high | 賞味期限切れ、主要材料不足 |
| critical | 消費期限切れ、hazardous、重大アレルゲン |

## 9. SeasoningBOM 出力要件

### 9.1 出力タイミング

レシピ詳細画面から `Download SBOM` ボタンで出力する。

### 9.2 出力形式

JSON 形式とする。

### 9.3 出力内容

```json
{
  "bomFormat": "SeasoningBOM",
  "specVersion": "0.1.0",
  "generatedAt": "2026-06-29T12:00:00+09:00",
  "recipe": {
    "name": "curry-rice",
    "version": "1.2.0",
    "servings": 4
  },
  "components": [
    {
      "name": "curry-roux",
      "quantity": 0.5,
      "unit": "box",
      "dependencyType": "required",
      "lifecycle": {
        "eolDate": "2026-07-05",
        "status": "active"
      },
      "dependencies": [
        {
          "name": "wheat",
          "dependencyType": "transitive",
          "allergens": ["wheat"]
        },
        {
          "name": "milk",
          "dependencyType": "transitive",
          "allergens": ["milk"]
        }
      ]
    }
  ],
  "audit": {
    "issues": []
  }
}
```

### 9.4 注意

- SeasoningBOM はその時点のスナップショットとして都度生成する。
- SeasoningBOM 自体は DB に保存しない。
- 必要に応じてユーザーがダウンロードする。
- 本物の SPDX / CycloneDX 完全互換は MVP では対象外。

## 10. recipe-lock.json 要件

`recipe-lock.json` は、同じ味を再現するための材料ロックファイルである。

MVP では対象外だが、P1 で対応する。

例:

```json
{
  "name": "curry-rice",
  "version": "1.2.0",
  "lockfileVersion": 1,
  "ingredients": [
    {
      "name": "soy-sauce",
      "lockedQuantity": 12,
      "unit": "ml",
      "brand": "いつもの醤油"
    }
  ]
}
```

用途:

- 同じ味の再現
- `nom ci` による厳密な買い物リスト生成
- レシピ差分比較
- ネタとしての lockfile 表現

## 11. ローカル保存要件

### 11.1 Web 版

Web 版は IndexedDB などの local DB に保存する。

保存対象:

- Recipe Repository
- Recipe
- Recipe Components
- Inventory Items
- Ingredient Dependency Metadata
- App Settings

### 11.2 モバイル版

モバイル版は SQLite に保存する。

保存対象は Web 版と同等とする。

### 11.3 Repository 層

Web 版とモバイル版の差分は Repository 層で隠蔽する。

```ts
type RecipeRepository = {
  findAll(): Promise<Recipe[]>;
  findById(id: string): Promise<Recipe | null>;
  save(recipe: Recipe): Promise<void>;
  delete(id: string): Promise<void>;
};

type InventoryRepository = {
  findAll(): Promise<InventoryItem[]>;
  findById(id: string): Promise<InventoryItem | null>;
  save(item: InventoryItem): Promise<void>;
  delete(id: string): Promise<void>;
};
```

実装例:

```text
Web
  IndexedDbRecipeRepository
  IndexedDbInventoryRepository

Mobile
  SQLiteRecipeRepository
  SQLiteInventoryRepository
```

## 12. データモデル案

### 12.1 RecipeRepositoryEntity

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

### 12.2 RecipeComponent

```ts
type RecipeComponent = {
  id: string;
  recipeId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: string[];
  alternatives: string[];
  transitiveDependencies: IngredientDependency[];
};
```

### 12.3 IngredientDependency

```ts
type IngredientDependency = {
  name: string;
  dependencyType: "transitive" | "substitute" | "peer";
  allergens: string[];
  notes?: string;
};
```

### 12.4 InventoryItem

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

### 12.5 LifecycleStatus

```ts
type LifecycleStatus =
  | "active"
  | "deprecated"
  | "eol"
  | "unsupported"
  | "hazardous";
```

### 12.6 DependencyType

```ts
type DependencyType =
  | "required"
  | "optional"
  | "dev"
  | "peer"
  | "transitive"
  | "substitute";
```

## 13. GitHub 風 UI 要件

### 13.1 Repository Header

レシピ詳細上部に GitHub Repository 風のヘッダーを表示する。

表示項目:

- Repository 名
- 説明文
- バージョン
- tags
- stars 風の評価数
- forks 風の派生レシピ数
- EOL / Security alert 件数

例:

```text
me / curry-rice

家庭用カレーライスの安定版レシピ

Public
v1.2.0
42 stars
3 forks
2 security alerts
```

### 13.2 Tabs

レシピ詳細には以下のタブを表示する。

| タブ | 内容 |
|---|---|
| Code | README、材料、手順 |
| Dependencies | 直接依存、推移的依存 |
| Security | `nom audit` 結果、EOL 警告、アレルゲン警告 |
| Issues | 食材の期限、改善メモ、不足材料 |
| Releases | レシピのバージョン履歴 |
| Insights | 食材使用頻度、EOL 救済率など |

MVP では Code、Dependencies、Security を優先する。

### 13.3 Code タブ

Code タブでは、README 風にレシピを表示する。

表示項目:

- レシピ概要
- 材料一覧
- 調理手順
- Download SBOM ボタン
- Export recipe-lock.json ボタン
- nom audit ボタン

### 13.4 Dependencies タブ

Dependencies タブでは、材料の直接依存と推移的依存を表示する。

表示例:

```text
Dependencies

Direct dependencies
- rice@2go
- curry-roux@half-box
- potato@3pieces

Transitive dependencies
- curry-roux
  - wheat
  - milk
  - soy
```

### 13.5 Security タブ

Security タブでは、`nom audit` の結果を Security alerts 風に表示する。

表示例:

```text
Security alerts

Critical
- chicken@200g is unsupported

High
- tofu@300g has reached EOL

Medium
- milk@1L will reach EOL in 1 day

Low
- curry-roux contains transitive dependency: wheat
```

### 13.6 Issues タブ

Issues タブでは、期限や改善メモを Issue 風に表示する。

例:

```text
#12 milk@1L will reach EOL tomorrow
labels: deprecated, food-loss

#13 curry-roux contains wheat
labels: allergen, transitive-dependency
```

### 13.7 Releases タブ

Releases タブでは、レシピのバージョン履歴を表示する。

例:

```text
v2.0.0
Breaking changes
- 玉ねぎを飴色にする工程を必須化
- 調理時間が 45 分増加

v1.2.0
Changes
- 牛乳を optional dependency に変更
```

### 13.8 Actions 風 UI

P2 では、調理手順を GitHub Actions 風に表示できる。

例:

```text
Cooking workflow

✓ Checkout ingredients
✓ Install dependencies
✓ Build curry base
✓ Run taste tests
✓ Deploy to table
```

## 14. バックアップ要件

### 14.1 エクスポート

ユーザーは全ローカルデータを JSON としてエクスポートできる。

```json
{
  "format": "SeasoningBOMAppBackup",
  "version": "0.1.0",
  "exportedAt": "2026-06-29T12:00:00+09:00",
  "repositories": [],
  "inventoryItems": [],
  "settings": {}
}
```

### 14.2 インポート

ユーザーはバックアップ JSON をインポートし、レシピと冷蔵庫インベントリを復元できる。

### 14.3 衝突時の扱い

MVP では単純上書きまたは別 ID としてインポートする。

P1 以降で差分マージを検討する。

## 15. 画面一覧

| 画面 | 内容 |
|---|---|
| Repository 一覧 | 登録済みレシピ一覧 |
| Repository 詳細 | GitHub 風のレシピ詳細 |
| Recipe Editor | レシピ編集 |
| Inventory | 冷蔵庫インベントリ |
| Security alerts | 全レシピ横断の EOL / アレルゲン警告 |
| EOL Dashboard | EOL 間近食材一覧 |
| Backup / Restore | JSON エクスポート、インポート |

## 16. 受け入れ条件

### 16.1 EOL 警告

```text
Given レシピ「curry-rice」が登録されている
And 材料に「milk 200ml」が含まれている
And 冷蔵庫の milk の賞味期限が明日である
When ユーザーが nom audit を実行する
Then 「milk will reach EOL in 1 day」という警告が表示される
And severity は medium になる
```

### 16.2 Unsupported 食材

```text
Given chicken の消費期限が昨日である
When ユーザーが chicken を含むレシピを開く
Then chicken は unsupported と表示される
And 推奨レシピには表示されない
And Security タブに critical として表示される
```

### 16.3 SeasoningBOM 出力

```text
Given レシピ詳細画面を表示している
When ユーザーが Download SBOM を押す
Then SeasoningBOM 形式の JSON ファイルがダウンロードされる
And JSON には recipe.name, recipe.version, components が含まれる
And components には direct dependency と transitive dependency が含まれる
```

### 16.4 GitHub 風 UI

```text
Given ユーザーがレシピ詳細画面を開く
Then Repository 名、説明、バージョン、tabs が表示される
And Code、Dependencies、Security タブを切り替えられる
```

### 16.5 ローカル保存

```text
Given ユーザーがレシピを登録している
When アプリを再起動する
Then 登録済みレシピが保持されている
```

### 16.6 Backup / Restore

```text
Given ユーザーがバックアップ JSON をエクスポートしている
When 別環境でバックアップ JSON をインポートする
Then レシピと冷蔵庫インベントリが復元される
```

## 17. 最小実装順

1. 型定義を作る
2. EOL 判定関数を作る
3. `nom audit` の純粋関数を作る
4. SeasoningBOM 生成関数を作る
5. Repository 抽象を作る
6. Web 版 IndexedDB 実装を作る
7. モバイル版 SQLite 実装を作る
8. GitHub 風 Repository 詳細画面を作る
9. Code タブを作る
10. Dependencies タブを作る
11. Security タブを作る
12. Backup / Restore を作る

## 18. MVP でやらないこと

| 項目 | 理由 |
|---|---|
| クラウド同期 | サーバー DB が必要になり重い |
| アカウント機能 | MVP には不要 |
| 本物の SPDX / CycloneDX 完全互換 | ネタの割に実装が重すぎる |
| 栄養素データベース連携 | データ整備が重い |
| スーパー在庫連携 | 外部連携が重い |
| レシート OCR | 精度と修正 UI が重い |
| バーコード読み取り | MVP 後でよい |
| AI レシピ生成 | コア体験がぼやける |

## 19. 一文要約

料理を GitHub Repository のように表現し、材料を依存パッケージ、賞味期限を EOL、監査を `nom audit` として扱う。Web 版は IndexedDB、モバイル版は SQLite に保存し、SeasoningBOM として直接依存および推移的依存を JSON 出力できるローカルファーストなネタ系レシピ管理アプリ。
