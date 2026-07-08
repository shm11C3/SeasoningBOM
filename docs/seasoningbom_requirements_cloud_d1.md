# SeasoningBOM レシピ共有サービス 要件一覧

## 0. サービスコピー

> 「食材ってSBOMで管理できるのでは？」というふとしたアイデアから始まった、エンジニアのためのレシピ管理サービス。

料理を GitHub Repository のように管理する。
材料は Dependencies。
賞味期限は EOL。
アレルゲンは Security alert。
レシピ改善は Pull Request。
家庭の味は Fork される。
そして料理活動で草が生える。

## 1. コンセプト

本サービスは、料理レシピをソフトウェアリポジトリのように管理・共有する、エンジニア向けのネタ寄りレシピ管理サービスである。

レシピに含まれる材料をコンポーネントとして扱い、直接依存・推移的依存・アレルゲン・賞味期限・消費期限を管理する。

料理の材料表を SBOM 風に出力でき、レシピごとに SeasoningBOM をダウンロードできる。

また、レシピを GitHub 風の Repository として公開し、Star、Fork、Dependency graph、Security alerts、Contribution graph を提供する。

## 2. 基本方針

| 項目 | 方針 |
|---|---|
| サービス種別 | Web ベースのレシピ共有サービス |
| 想定ユーザー | エンジニア、OSS好き、料理好き、ネタアプリ好き |
| UI | GitHub 風 |
| DB | Cloudflare D1 |
| API | Cloudflare Workers |
| Hosting | Cloudflare Pages |
| 認証 | P0 は Clerk の Google / GitHub social login のみ |
| Repository 公開範囲 | public / private / unlisted |
| SBOM 出力 | SeasoningBOM JSON |
| Contribution | 調理、レシピ更新、EOL救済などで草を生やす |
| Inventory | ユーザーごとの非公開データ |
| MVP 方針 | GitHub parody SaaS として成立させる |

## 3. 用語

| 用語 | 意味 |
|---|---|
| Recipe Repository | レシピを管理するリポジトリ風の単位 |
| Recipe | 具体的な料理 |
| Component | レシピに含まれる材料 |
| Direct Dependency | レシピが直接必要とする材料 |
| Transitive Dependency | 材料が内部的に含む別の材料 |
| EOL | 賞味期限 |
| Unsupported | 消費期限切れ |
| Security Alert | Recipe Alert と本人限定 Inventory Audit を含む Security 風の警告表示 |
| SeasoningBOM | 本サービス独自の SBOM 風 JSON |
| nom audit | レシピ監査機能 |
| nom install | 不足材料から買い物リストを作る機能 |
| nom outdated | EOL 間近または EOL 済み食材を表示する機能 |
| recipe-lock.json | 同じ味を再現するための材料ロックファイル |
| Fork | 他人のレシピを派生させること |
| Star | レシピ Repository への評価 |
| Cooking Log | 実際に料理した記録 |
| Contribution | 草として集計されるユーザー活動 |
| EOL Rescue | EOL 間近の食材を使い切った記録 |

## 4. MVP 機能要件

| ID | 要件 |
|---|---|
| P0-1 | ユーザーは Clerk の Google / GitHub social login でログインできる |
| P0-2 | ユーザーは Recipe Repository を作成、編集、削除できる |
| P0-3 | Repository には owner、name、slug、description、version、visibility を設定できる |
| P0-4 | Repository は public / private / unlisted の公開範囲を持てる |
| P0-5 | Public Repository は URL で共有できる |
| P0-6 | Private Repository は所有者のみ閲覧・編集できる |
| P0-7 | レシピには材料、分量、単位、手順、人数を設定できる |
| P0-8 | 材料には required / optional / peer / transitive / substitute などの依存種別を設定できる |
| P0-9 | 材料は推移的依存を持てる |
| P0-10 | Repository 詳細を GitHub 風 UI で表示できる |
| P0-11 | Repository 詳細には Code、Dependencies、Security のタブを表示できる |
| P0-12 | Dependencies タブで直接依存と推移的依存を表示できる |
| P0-13 | Security タブで公開可能な Recipe Alert と本人向け Inventory Audit を分けて表示できる |
| P0-14 | レシピ詳細から SeasoningBOM JSON をダウンロードできる |
| P0-15 | SeasoningBOM には直接依存と推移的依存を含められる |
| P0-16 | ユーザーは自分の Inventory を登録、編集、削除できる |
| P0-17 | Inventory には食材名、カテゴリ、数量、単位、賞味期限、消費期限を設定できる |
| P0-18 | Inventory 由来の監査結果は本人にのみ表示される |
| P0-19 | nom audit により、EOL 間近、EOL 済み、Unsupported、アレルゲン、不足材料を検出できる |
| P0-20 | Public Repository に Star を付けられる |
| P0-21 | Public Repository を Fork できる |
| P0-22 | Fork 元 Repository を表示できる |
| P0-23 | ユーザーの Contribution graph を表示できる |
| P0-24 | レシピ更新、調理ログ、EOL 救済などを Contribution として記録できる |
| P0-25 | ユーザープロフィールに年間 Contribution graph を表示できる |

## 5. P1 機能要件

| ID | 要件 |
|---|---|
| P1-1 | Pull Request 風のレシピ改善提案を作成できる |
| P1-2 | Issues 風にレシピ改善メモや期限警告を管理できる |
| P1-3 | Releases 風にレシピのバージョン履歴を表示できる |
| P1-4 | recipe-lock.json を出力できる |
| P1-5 | recipe-lock.json を Repository に保存できる |
| P1-6 | Trending Recipes を表示できる |
| P1-7 | Repository 検索ができる |
| P1-8 | Organization 風に Family / Team を作れる |
| P1-9 | Family Organization 内でレシピを共有できる |
| P1-10 | Contribution graph を Repository 単位でも表示できる |
| P1-11 | Contribution streak を表示できる |
| P1-12 | EOL Rescue 数をプロフィールに表示できる |
| P1-13 | Achievement バッジを表示できる |

## 6. P2 機能要件

| ID | 要件 |
|---|---|
| P2-1 | GitHub Actions 風に調理手順を Workflow として表示できる |
| P2-2 | nom ci 風に recipe-lock.json に従って厳密な買い物リストを生成できる |
| P2-3 | nom outdated 風に EOL 間近食材一覧を表示できる |
| P2-4 | nom dedupe 風に重複食材を統合できる |
| P2-5 | Discussions 風に調理メモや味の改善案を管理できる |
| P2-6 | 草の種類を活動種別ごとに変えられる |
| P2-7 | 草画像を SNS 共有できる |
| P2-8 | バーコード読み取りに対応できる |
| P2-9 | レシート OCR に対応できる |
| P2-10 | モバイルアプリに対応できる |

## 7. Repository 表現

レシピは GitHub Repository のように表現する。

例:

```text
shoma / curry-rice

家庭用カレーライスの安定版レシピ

Public
v1.2.0
42 stars
3 forks
2 security alerts
```

Repository が持つ情報:

| 項目 | 内容 |
|---|---|
| owner | 所有ユーザー |
| name | Repository 名 |
| slug | URL 用識別子 |
| description | 説明 |
| visibility | public / private / unlisted |
| version | レシピバージョン |
| servings | 人数 |
| tags | 和食、洋食、節約、EOL救済など |
| license | ネタ用ライセンス |
| readme | README 風の説明 |
| components | 材料一覧 |
| steps | 調理手順 |
| sourceRepositoryId | Fork 元 Repository |

## 8. 依存関係要件

### 8.1 Direct Dependencies

レシピが直接必要とする材料を Direct Dependencies として扱う。

```text
curry-rice@1.2.0
├── rice@2go
├── curry-roux@half-box
├── potato@3pieces
├── carrot@1piece
├── onion@2pieces
└── pork@300g
```

### 8.2 Transitive Dependencies

材料が内部的に含む別の材料を Transitive Dependencies として扱う。

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
- nom audit
- 「この料理、依存関係が深すぎる」というネタ表示

### 8.3 Dependency Type

| 種類 | 意味 | 例 |
|---|---|---|
| required | 必須材料 | 米、ルー |
| optional | 任意材料 | 福神漬け、チーズ |
| dev | 調理補助 | 計量スプーン、圧力鍋 |
| peer | 相性依存 | カレーに対する米 |
| transitive | 材料内部の依存 | ルーに含まれる小麦 |
| substitute | 代替材料 | 牛乳の代わりに豆乳 |

## 9. EOL 要件

賞味期限、消費期限、危険フラグから食材の状態を判定する。

| 状態 | 条件 | 表示例 | 扱い |
|---|---|---|---|
| active | EOL まで 4 日以上 | Supported | 通常利用可能 |
| deprecated | EOL まで 1 から 3 日 | Deprecated | 早めの利用を推奨 |
| eol | 賞味期限切れ | EOL | 注意表示 |
| unsupported | 消費期限切れ | Unsupported | 利用推奨しない |
| hazardous | ユーザーが危険フラグを付けた | Critical | 利用不可扱い |

補足:

- status は DB に保存せず、日付から都度計算する。
- hazardous はユーザーが手動で付ける危険フラグとする。
- 消費期限切れはネタ表現にしても安全側に倒す。
- unsupported と hazardous の食材を使うレシピは推奨候補から除外する。

## 10. nom audit 要件

nom audit は、Recipe Repository と Inventory を照合して問題を検出する。

### 10.1 監査項目

| 項目 | 内容 |
|---|---|
| EOL 監査 | 材料が EOL 間近または EOL 済みではないか |
| Unsupported 監査 | 消費期限切れ食材が含まれていないか |
| Hazardous 監査 | 危険フラグ付き食材が含まれていないか |
| アレルゲン監査 | 卵、乳、小麦などを含むか |
| 不足材料監査 | Inventory にない材料がないか |
| 推移的依存監査 | 直接材料の内部依存にアレルゲンなどがないか |
| 代替可能性監査 | 代替食材が設定されているか |
| ライセンス監査 | 秘伝のタレ、母の味などの再利用注意を表示する |

### 10.2 監査結果表示

```text
nom audit found 4 issues.

CRITICAL  chicken@200g is unsupported
HIGH      tofu@300g has reached EOL
MEDIUM    milk@1L will reach EOL in 1 day
LOW       curry-roux contains transitive dependency: wheat
```

### 10.3 Severity

| Severity | 条件 |
|---|---|
| low | 注意情報、任意材料不足、軽微な依存情報 |
| medium | EOL 間近、代替材料なし |
| high | 賞味期限切れ、主要材料不足 |
| critical | 消費期限切れ、hazardous、重大アレルゲン |

## 11. SeasoningBOM 出力要件

### 11.1 出力タイミング

Repository 詳細画面から `Download SBOM` ボタンで出力する。

### 11.2 出力形式

JSON 形式とする。

### 11.3 出力例

```json
{
  "bomFormat": "SeasoningBOM",
  "specVersion": "0.1.0",
  "generatedAt": "2026-07-01T12:00:00+09:00",
  "repository": {
    "owner": "shoma",
    "name": "curry-rice",
    "version": "1.2.0",
    "visibility": "public"
  },
  "components": [
    {
      "name": "curry-roux",
      "quantity": 0.5,
      "unit": "box",
      "dependencyType": "required",
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

注意:

- SeasoningBOM はその時点のスナップショットとして都度生成する。
- SeasoningBOM 自体は DB に保存しない。
- Inventory 由来の個人情報は Public SBOM に含めない。

## 12. Contribution graph 要件

### 12.1 目的

ユーザーの料理活動を GitHub の草風に可視化する。

料理を作る、レシピを更新する、EOL 間近の食材を救済する、他人のレシピを Fork するなどの活動を Contribution として記録し、プロフィール画面に年間カレンダー形式で表示する。

### 12.2 Contribution 対象イベント

| イベント | 説明 | Count |
|---|---|---:|
| recipe_created | Recipe Repository を作成した | 1 |
| recipe_updated | レシピ内容を更新した | 1 |
| component_added | 材料を追加した | 1 |
| dependency_added | 推移的依存を追加した | 1 |
| cooking_logged | 料理を作った記録を追加した | 1 |
| eol_rescued | EOL 間近の食材を使い切った | 2 |
| audit_fixed | nom audit の警告を解消した | 2 |
| repository_forked | Public Repository を Fork した | 1 |
| release_created | レシピ Release を作成した | 1 |
| pull_request_merged | レシピ改善提案が取り込まれた | 2 |

MVP では以下を対象にする。

- recipe_created
- recipe_updated
- cooking_logged
- eol_rescued
- repository_forked

### 12.3 Contribution として数えないイベント

| イベント | 理由 |
|---|---|
| ログイン | 実質的な料理活動ではない |
| Repository 閲覧 | 実質的な料理活動ではない |
| Star 付与 | 消費的アクションであり作成活動ではない |
| Inventory の単純な数量修正 | ノイズが多い |
| 同一内容の連続保存 | 草の水増しになる |
| 自分の Repository の公開範囲変更 | 料理活動ではない |

### 12.4 Contribution 強度

| Level | 条件 | 表示 |
|---|---|---|
| 0 | 0 contributions | No cooking |
| 1 | 1 contribution | Light simmer |
| 2 | 2 から 3 contributions | Medium heat |
| 3 | 4 から 6 contributions | High heat |
| 4 | 7 以上 contributions | Burning kitchen |

### 12.5 プロフィール表示

```text
shoma

Repository-style cooking enthusiast

1,284 contributions in the last year

[Contribution graph]

Longest cooking streak: 21 days
Current cooking streak: 4 days
EOL rescues: 32
Repositories: 18
Stars received: 240
Forks received: 12
```

### 12.6 ネタ表示

```text
村上さんは過去 1 年で 1,284 回キッチンに commit しました。
```

```text
EOL 間近の牛乳を救済しました。
+2 contributions
```

```text
今日の草はカレーで生えました。
```

```text
This contribution was made with expired dependencies.
```

## 13. Privacy 要件

| データ | 公開範囲 |
|---|---|
| Public Repository | 誰でも閲覧可能 |
| Private Repository | 所有者のみ |
| Unlisted Repository | URL を知っている人のみ |
| Repository の材料 | Repository の公開範囲に従う |
| 推移的依存 | Repository の公開範囲に従う |
| Inventory | 本人のみ |
| Inventory 由来の audit | 本人のみ |
| Cooking Log | ユーザー設定に従う |
| Contribution graph | public / private / summary_only |
| Contribution 詳細 | Private Event は本人のみ |

Contribution graph のデフォルト公開範囲は `summary_only` とする。

理由:

- 料理ログから生活パターンを推測される可能性がある。
- Inventory 由来のイベントはプライベート性が高い。
- EOL Rescue から冷蔵庫事情が見える可能性がある。

## 14. GitHub 風 UI 要件

### 14.1 Repository Header

```text
shoma / curry-rice                         Public

家庭用カレーライスの安定版レシピ

⭐ 42 stars   🍴 3 forks   ⚠️ 2 recipe alerts
```

### 14.2 Tabs

| タブ | 内容 |
|---|---|
| Code | README、材料、手順 |
| Dependencies | 直接依存、推移的依存 |
| Security | nom audit、アレルゲン、EOL 警告 |
| Issues | 食材の期限、改善メモ、不足材料 |
| Releases | レシピのバージョン履歴 |
| Insights | 草、EOL 救済率、Star 推移 |

MVP では Code、Dependencies、Security を優先する。

### 14.3 Code タブ

```text
README.md

# Curry Rice

## Ingredients
- rice@2go
- curry-roux@half-box
- potato@3pieces
- carrot@1piece

## Steps
1. Checkout ingredients
2. Install dependencies
3. Build curry base
4. Deploy to table
```

操作:

- Edit recipe
- Download SBOM
- Run nom audit
- Log cooking
- Fork
- Star

### 14.4 Dependencies タブ

```text
Dependency graph

curry-rice@1.2.0
├── rice@2go
├── curry-roux@half-box
│   ├── wheat
│   ├── milk
│   └── soy
└── potato@3pieces
```

### 14.5 Security タブ

Public 表示:

```text
Recipe alerts

Medium
- curry-roux contains wheat

Low
- dependency tree depth is 2
```

本人向け表示:

```text
Your inventory audit

High
- milk in your inventory reached EOL

Medium
- potato will reach EOL in 2 days
```

### 14.6 Profile ページ

```text
shoma

Repository-style cooking enthusiast

1,284 contributions in the last year

[Contribution graph]

Pinned repositories
- shoma/curry-rice
- shoma/eol-rescue-fried-rice
- shoma/miso-soup
```

## 15. D1 テーブル案

### 15.1 user_profiles

```sql
CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  contribution_visibility TEXT NOT NULL DEFAULT 'summary_only',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(auth_provider, auth_subject),
  UNIQUE(username)
);
```

`username` は URL に使う SeasoningBOM 内の stable User Handle とする。P0 では Clerk/provider profile の表示名・username・email local-part などから候補を作るか、ユーザー入力で予約する。provider 側の表示名・username・email 変更に自動追従しない。`api` / `backup` / `eol` / `inventory` / `new` / `repositories` / `security` / `users` などアプリの route root は User Handle として予約できない。認証上の安定キーは `auth_provider = "clerk"` と `auth_subject = Clerk user id` とする。

Clerk が sign-in、sessions、account linking を所有する。SeasoningBOM は password、password reset、SMS login を持たず、アプリ側の所有権・認可・URL identity だけを `user_profiles` に保存する。

### 15.2 recipe_repositories

```sql
CREATE TABLE recipe_repositories (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL,
  version TEXT NOT NULL,
  servings INTEGER NOT NULL,
  readme TEXT,
  license TEXT,
  source_repository_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(source_repository_id) REFERENCES recipe_repositories(id),
  UNIQUE(owner_user_id, slug)
);
```

### 15.3 recipe_components

```sql
CREATE TABLE recipe_components (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  required INTEGER NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);
```

### 15.4 ingredient_dependencies

```sql
CREATE TABLE ingredient_dependencies (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  dependency_name TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  FOREIGN KEY(component_id) REFERENCES recipe_components(id)
);
```

### 15.5 inventory_items

```sql
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  best_before_date TEXT,
  use_by_date TEXT,
  hazardous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user_profiles(id)
);
```

### 15.6 repository_stars

```sql
CREATE TABLE repository_stars (
  user_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, repository_id),
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);
```

### 15.7 contribution_events

```sql
CREATE TABLE contribution_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  repository_id TEXT,
  occurred_on TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  contribution_count INTEGER NOT NULL DEFAULT 1,
  visibility TEXT NOT NULL DEFAULT 'summary_only',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);

CREATE INDEX idx_contribution_events_user_date
ON contribution_events(user_id, occurred_on);

CREATE INDEX idx_contribution_events_repository
ON contribution_events(repository_id);
```

### 15.8 cooking_logs

```sql
CREATE TABLE cooking_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT,
  cooked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);
```

## 16. API 要件

### 16.1 Auth

```text
GET  /api/me
POST /api/me/profile
```

Sign-in / sign-up / sign-out UI は Clerk の prebuilt UI または hosted UI に委譲する。Workers API は protected endpoint ごとに Clerk session token を検証し、`GET /api/me` では current Clerk user に対応する `user_profiles` と権限情報を返す。`POST /api/me/profile` は初回 sign-in 後の User Handle 予約・profile 初期化に使うため、valid Clerk session だが `user_profiles` がまだ存在しない状態だけを許可する bootstrap endpoint として扱う。その他の private data endpoint は `user_profiles` が存在しなければ拒否する。

### 16.2 Repository

```text
GET    /api/repos
POST   /api/repos
GET    /api/repos/:owner/:repo
PATCH  /api/repos/:owner/:repo
DELETE /api/repos/:owner/:repo

POST   /api/repos/:owner/:repo/star
DELETE /api/repos/:owner/:repo/star

POST   /api/repos/:owner/:repo/fork

GET    /api/repos/:owner/:repo/bom
GET    /api/repos/:owner/:repo/dependencies
PUT    /api/repos/:owner/:repo/dependencies
GET    /api/repos/:owner/:repo/security
```

### 16.3 Inventory

```text
GET    /api/inventory
POST   /api/inventory
PATCH  /api/inventory/:id
DELETE /api/inventory/:id
```

### 16.4 Audit

```text
POST /api/repos/:owner/:repo/audit
```

### 16.5 Cooking Log

```text
GET  /api/repos/:owner/:repo/cooking-logs
POST /api/repos/:owner/:repo/cooking-logs
```

`GET` は Repository の public / private / unlisted 公開範囲を先に確認する。返却する Cooking Log 詳細は、投稿者の `contribution_visibility` が `public` のものと、閲覧者本人が投稿したものに限定する。`summary_only` / `private` のユーザーの Cooking Log 詳細を第三者へ公開しない。

`POST` は Bearer token による Clerk session と bootstrapped profile を必須とする。作成時は現在の Repository version を `recipe_version` として保存し、同じ D1 batch で `cooking_logged` contribution event を 1 件作成する。

### 16.6 Contributions

```text
GET /api/users/:username/contributions?from=2025-07-01&to=2026-07-01
GET /api/users/:username/contributions/:date
GET /api/users/:username/profile
```

## 17. 受け入れ条件

### 17.1 Repository 共有

```text
Given ユーザーが Public Repository shoma/curry-rice を作成している
When 未ログインユーザーが /shoma/curry-rice にアクセスする
Then Repository の Code、Dependencies、Security タブを閲覧できる
```

### 17.2 Private Repository

```text
Given ユーザーが Private Repository shoma/secret-sauce を作成している
When 他ユーザーが /shoma/secret-sauce にアクセスする
Then Repository 内容は表示されない
```

### 17.3 Fork

```text
Given shoma/curry-rice が Public Repository として存在する
When taro が Fork を実行する
Then taro/curry-rice が作成される
And Forked from shoma/curry-rice と表示される
```

### 17.4 SeasoningBOM

```text
Given Repository 詳細画面を表示している
When ユーザーが Download SBOM を押す
Then SeasoningBOM JSON がダウンロードされる
And JSON には direct dependency と transitive dependency が含まれる
```

### 17.5 Contribution graph

```text
Given ユーザーが curry-rice の Cooking Log を追加した
When ユーザープロフィールを表示する
Then 該当日の Contribution count が 1 増える
```

### 17.6 EOL Rescue Contribution

```text
Given ユーザーの Inventory に EOL まで 1 日の milk がある
And ユーザーが milk を使用する Cooking Log を追加した
When プロフィールを表示する
Then 該当日に eol_rescued Contribution が記録される
And Contribution count は 2 増える
```

### 17.7 Contribution Privacy

```text
Given ユーザーが Contribution visibility を summary_only にしている
When 他ユーザーがプロフィールを見る
Then Contribution graph と件数は表示される
And 詳細な Cooking Log と Inventory 由来イベントは表示されない
```

## 18. 最小実装順

1. Cloudflare Workers + D1 のプロジェクトを作る
2. user_profiles / recipe_repositories / recipe_components / ingredient_dependencies を作る
3. Clerk social login と Workers API の session verification を実装する
4. Repository 作成、編集、閲覧を実装する
5. Public / Private / Unlisted のアクセス制御を実装する
6. GitHub 風 Repository 詳細 UI を作る
7. Dependencies タブを作る
8. SeasoningBOM 出力を作る
9. Security タブを作る
10. Star を作る
11. Fork を作る
12. Inventory を作る
13. nom audit を作る
14. Cooking Log を作る
15. contribution_events を作る
16. プロフィールの Contribution graph を作る

## 19. MVP でやらないこと

| 項目 | 理由 |
|---|---|
| Pull Request | 実装が重いので Fork で代替する |
| Issues | MVP 後でよい |
| Organization | MVP 後でよい |
| モバイルアプリ | Web で成立確認後 |
| recipe-lock.json の永続保存 | P1 でよい |
| 本物の SPDX / CycloneDX 完全互換 | ネタの割に重い |
| 栄養素データベース連携 | データ整備が重い |
| レシート OCR | 修正 UI が重い |
| バーコード読み取り | MVP 後でよい |
| AI レシピ生成 | コア体験がぼやける |

## 20. ネタコピー案

```text
No contributions today.
Cook something to keep your streak alive.
```

```text
Your kitchen has 3 security alerts.
```

```text
This recipe has 12 dependencies and 4 transitive dependencies.
```

```text
This curry was forked from grandma/original-curry.
```

```text
1,284 contributions in the last year.
Mostly curry.
```

```text
You rescued 32 ingredients from EOL this year.
```

```text
Deploy to table succeeded.
```

```text
This recipe contains deprecated ingredients.
Run nom audit for details.
```

```text
Your curry build passed all taste checks.
```

## 21. 一文要約

「食材って SBOM で管理できるのでは？」というアイデアから始まった、エンジニアのためのレシピ管理サービス。Cloudflare D1 上で料理レシピを GitHub Repository 風に管理し、材料依存、推移的依存、SeasoningBOM、Security alerts、Star、Fork、Contribution graph を備える。
