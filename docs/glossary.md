# Glossary

SeasoningBOM は、料理とソフトウェアサプライチェーンの語彙を混ぜたアプリです。

この glossary は、実装・UI・README・ドキュメントで使う用語の揺れを防ぐための基準です。

## Product Terms

| Term | Meaning |
| --- | --- |
| SeasoningBOM | アプリ名、および独自 SBOM 風 JSON 形式の名前 |
| FBOM | Food BOM の略称。副題・内部コードネームとして使用可 |
| Recipe Repository | 料理レシピを GitHub Repository 風に扱う共有単位。`owner + slug` で識別する |
| Recipe | Recipe Repository 内の具体的な料理内容 |
| Repository Owner | Recipe Repository を所有するユーザー |
| User Handle | SeasoningBOM 内で予約され、URL に使われる安定 username |
| Repository Slug | owner 内で一意な URL 用識別子 |
| Component | レシピに含まれる材料 |
| Inventory Item | 冷蔵庫・食品庫にある食材 |
| Recipe Alert | Repository 内容だけから生成できる公開可能な警告 |
| Inventory Audit | Repository と本人の Inventory を照合する本人限定の監査 |
| Repository layer | IndexedDB / SQLite などの永続化差分を隠す層 |

## Dependency Terms

| Term | Meaning |
| --- | --- |
| Direct Dependency | レシピが直接必要とする材料 |
| Transitive Dependency | 材料内部に含まれる別材料 |
| Required Dependency | 必須材料 |
| Optional Dependency | 任意材料 |
| Dev Dependency | 調理補助。例: 計量スプーン、圧力鍋 |
| Peer Dependency | 相性依存。例: カレーに対する米 |
| Substitute Dependency | 代替材料 |
| Dependency graph | 材料の直接・推移的依存関係 |

## Lifecycle Terms

| Term | Meaning |
| --- | --- |
| EOL | 賞味期限。End of Life のネタ表現 |
| Deprecated | EOL 間近 |
| Unsupported | 消費期限切れ。利用推奨しない |
| Hazardous | ユーザーが危険フラグを付けた食材。利用不可扱い |
| Supported | 通常利用可能 |
| Lifecycle Status | `active`, `deprecated`, `eol`, `unsupported`, `hazardous` の総称 |

## Command Joke Terms

| Term | Meaning |
| --- | --- |
| `nom audit` | Recipe Alert と本人限定 Inventory Audit を実行する監査コマンド風の総称 |
| `nom install` | 不足材料から買い物リストを生成する |
| `nom outdated` | EOL 間近または EOL 済み食材を表示する |
| `nom dedupe` | 重複食材を統合する将来機能 |
| `nom ci` | `recipe-lock.json` に従って厳密な買い物リストを生成する将来機能 |

## GitHub UI Terms

| Term | Meaning |
| --- | --- |
| Code tab | README、材料、手順、主要アクションを表示するタブ |
| Dependencies tab | 直接依存・推移的依存を表示するタブ |
| Security tab | Recipe Alert と、ログイン本人向け Inventory Audit を Security alerts 風に表示するタブ |
| Issues tab | 食材期限・改善メモ・不足材料を Issue 風に表示する将来タブ |
| Releases tab | レシピのバージョン履歴を表示する将来タブ |
| Insights tab | EOL 救済率などを表示する将来タブ |

## File / Format Terms

| Term | Meaning |
| --- | --- |
| SeasoningBOM JSON | レシピ単位で出力する SBOM 風 snapshot |
| `recipe-lock.json` | 同じ味を再現するための材料 lockfile。P1 予定 |
| SeasoningBOMAppBackup | アプリ全体の backup / restore 用 JSON |

## Naming Rules

### App name

Use:

- `SeasoningBOM`

Avoid:

- `Seasoning Bom`
- `seasoningBOM`
- `SBOM App`

### Package name

Use:

- `seasoning-bom`

### Repository / directory name

Current local directory:

- `FBOM`

This can remain as internal/project folder name. Public-facing product name is `SeasoningBOM`.

### Real license vs joke license

Real source code license:

- MIT

Joke recipe license examples:

- `Mother's Taste License`
- `Secret Sauce License`
- `Grandma Public License`

Never describe joke recipe licenses as the actual source license.
