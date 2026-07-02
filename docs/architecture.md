# Architecture

SeasoningBOM は、React + Vite + TypeScript による Web 先行アプリとして設計します。

MVP では Web のみを実装し、データ永続化には IndexedDB を使用します。将来のモバイル版では SQLite を利用する想定ですが、アプリケーション層からは Repository インターフェース越しにアクセスし、永続化方式の差分を隠蔽します。

## Technology Decisions

| Area | Decision |
| --- | --- |
| Language | TypeScript |
| UI | React |
| Build | Vite |
| UI library | `@primer/react` |
| Icons | Temporary internal SVG placeholders |
| Web storage | IndexedDB |
| IndexedDB wrapper | Dexie.js |
| React data binding | `dexie-react-hooks` / `useLiveQuery` |
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
    indexeddb/
    memory/

  db/
    schema/
    migrations/

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
- `nom audit`
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

- UI は具体的な IndexedDB 実装ではなく contract に依存する。
- 将来の SQLite 実装と同じ contract を使えるようにする。

### `repositories/indexeddb/`

Dexie を使った Web 向け実装を置きます。

Examples:

- `IndexedDbRecipeRepository`
- `IndexedDbInventoryRepository`
- `IndexedDbBackupRepository`

Rules:

- Dexie 固有の API はここに閉じ込める。
- migration は `db/` 配下に寄せる。

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
IndexedDB implementation (Dexie)
  ↓
useLiveQuery observes changes
  ↓
React re-renders
```

For computed outputs:

```text
Recipe + Inventory + now
  ↓
domain pure function
  ↓
AuditResult / SeasoningBOM / Recommendation
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

## MVP Route Structure

Initial route plan:

| Route | Purpose |
| --- | --- |
| `/` | Repository list / dashboard |
| `/repositories/:slug` | GitHub-style recipe repository detail |
| `/repositories/:slug/edit` | Recipe editor |
| `/inventory` | Fridge inventory |
| `/security` | Cross-recipe security alerts |
| `/eol` | EOL dashboard |
| `/backup` | Backup / restore |

## Error Handling Policy

MVP はローカルアプリなので、エラーは次の方針で扱います。

- User input validation error: UI 上で即時表示する。
- Import schema error: 何が不正かを表示し、既存データは変更しない。
- IndexedDB error: ユーザーに再試行 / backup export を促す。
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
