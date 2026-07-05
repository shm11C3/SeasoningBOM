# SeasoningBOM Overview

SeasoningBOM は、料理レシピをソフトウェアリポジトリのように扱う、GitHub パロディのレシピ共有サービスです。

料理を **Repository**、材料を **Dependencies**、賞味期限を **EOL**、監査を **`nom audit`**、不足材料の買い物リスト化を **`nom install`** として表現します。

実用面では、公開・非公開レシピ共有、冷蔵庫内の食材管理、期限が近い食材を優先するレシピ提案、アレルゲンや期限切れ食材の検出を行います。ネタ面では、GitHub / SBOM / サプライチェーン監査の語彙を料理に持ち込み、食品ロス対策をソフトウェア開発者に刺さる形で表現します。

## Product Statement

> SeasoningBOM は、料理を GitHub Repository のように表現し、材料を依存パッケージ、賞味期限を EOL、監査を `nom audit` として扱う、エンジニア向けのレシピ共有サービスです。

## Core Joke

SeasoningBOM の中心にあるジョークは、**料理もまた依存関係の集合である** という見立てです。

- カレーライスは `curry-rice@1.2.0`
- 米、ルー、玉ねぎ、じゃがいもは direct dependencies
- カレールーに含まれる小麦、乳、牛脂、香辛料は transitive dependencies
- 賞味期限切れは EOL
- 消費期限切れは unsupported
- アレルゲンや期限切れは security alerts
- 買い物リスト生成は `nom install`
- 同じ味を再現する材料固定は `recipe-lock.json`

## Product Goals

### MVP Goals

1. レシピを GitHub Repository 風 UI で閲覧・編集できる。
2. Repository を stable User Handle の `owner + slug` で識別し、public / private / unlisted の visibility を扱える。
3. GitHub OAuth でログインできる。
4. 公開可能な Recipe Alert と本人限定の Inventory Audit を分けて表示できる。
5. ユーザーごとの非公開 Inventory を管理できる。
6. Star、Fork、Contribution graph によりレシピ共有サービスとして成立する。
7. レシピから private inventory を含まない SeasoningBOM JSON を生成・ダウンロードできる。
8. Cloudflare Pages / Workers / D1 上で動作する。

### Non-Goals for MVP

- 本物の SPDX / CycloneDX 完全互換
- 栄養素データベース連携
- レシート OCR
- バーコード読み取り
- AI レシピ生成
- モバイル SQLite 実装
- Pull Request 風のレシピ改善フロー
- Organizations / Teams

## Design Principles

### 1. Joke first, safety always

アプリはジョークアプリですが、食品安全に関わる判断は安全側に倒します。

- 消費期限切れ食材を推奨しない。
- hazardous 食材は利用不可扱いにする。
- 期限切れ食材の利用を軽く扱う文言にしない。

### 2. Shareable, private where it matters

MVP は hosted sharing service ですが、個人の Inventory は公開 Repository と混ぜません。

- Repository content は visibility に従って共有する。
- Inventory は本人のみ閲覧できる。
- Inventory Audit details は public API / public SeasoningBOM に含めない。
- 既存 IndexedDB 実装は local prototype / development adapter として扱う。

### 3. Domain logic before UI magic

EOL 判定、`nom audit`、SeasoningBOM 生成は、UI に依存しない純粋関数として実装します。

これにより:

- テストしやすい。
- IndexedDB / SQLite に依存しない。
- UI が変わっても監査結果が安定する。

### 4. GitHub-like, GitHub-authenticated

UI は GitHub 風で、ログインには GitHub OAuth を使います。ただし、GitHub repository そのものを読み書きするサービスではありません。

- `@primer/react` を採用する。
- アイコンは最終方針が決まるまで、内部の仮 SVG アイコンを使う。
- GitHub の情報設計をネタとして借りる。
- 実データモデルは SeasoningBOM 独自のドメインを優先する。

### 5. Public-source readability

ソースコード公開予定のため、実装は読まれる前提で書きます。

- 型でドメイン語彙を表現する。
- 純粋関数を厚めにテストする。
- README / AGENTS.md / docs を実装と同期する。
