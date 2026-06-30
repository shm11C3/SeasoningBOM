# SeasoningBOM Overview

SeasoningBOM は、料理レシピをソフトウェアリポジトリのように扱う、ローカルファーストなジョーク系レシピ管理アプリです。

料理を **Repository**、材料を **Dependencies**、賞味期限を **EOL**、監査を **`nom audit`**、不足材料の買い物リスト化を **`nom install`** として表現します。

実用面では、冷蔵庫内の食材管理、期限が近い食材を優先するレシピ提案、アレルゲンや期限切れ食材の検出を行います。ネタ面では、GitHub / SBOM / サプライチェーン監査の語彙を料理に持ち込み、食品ロス対策をソフトウェア開発者に刺さる形で表現します。

## Product Statement

> SeasoningBOM は、料理を GitHub Repository のように表現し、材料を依存パッケージ、賞味期限を EOL、監査を `nom audit` として扱う、ローカルファーストなネタ系レシピ管理アプリです。

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
2. 冷蔵庫インベントリを管理できる。
3. 材料の賞味期限・消費期限から lifecycle status を判定できる。
4. `nom audit` で EOL、unsupported、hazardous、アレルゲン、不足材料を検出できる。
5. レシピから SeasoningBOM JSON を生成・ダウンロードできる。
6. 全データをブラウザ内 IndexedDB に保存できる。
7. 全データを JSON としてバックアップ / リストアできる。

### Non-Goals for MVP

- アカウント機能
- クラウド同期
- 本物の SPDX / CycloneDX 完全互換
- 栄養素データベース連携
- レシート OCR
- バーコード読み取り
- AI レシピ生成
- モバイル SQLite 実装

## Design Principles

### 1. Joke first, safety always

アプリはジョークアプリですが、食品安全に関わる判断は安全側に倒します。

- 消費期限切れ食材を推奨しない。
- hazardous 食材は利用不可扱いにする。
- 期限切れ食材の利用を軽く扱う文言にしない。

### 2. Local-first and inspectable

MVP はサーバー DB やアカウントを持ちません。

- データはブラウザ内 IndexedDB に保存する。
- バックアップ / リストアは JSON で行う。
- 将来のモバイル SQLite は Repository 層で差し替え可能にする。

### 3. Domain logic before UI magic

EOL 判定、`nom audit`、SeasoningBOM 生成は、UI に依存しない純粋関数として実装します。

これにより:

- テストしやすい。
- IndexedDB / SQLite に依存しない。
- UI が変わっても監査結果が安定する。

### 4. GitHub-like, not GitHub-dependent

UI は GitHub 風ですが、GitHub と連携するアプリではありません。

- `@primer/react` と `@primer/octicons-react` を採用する。
- GitHub の情報設計をネタとして借りる。
- 実データモデルは SeasoningBOM 独自のドメインを優先する。

### 5. Public-source readability

ソースコード公開予定のため、実装は読まれる前提で書きます。

- 型でドメイン語彙を表現する。
- 純粋関数を厚めにテストする。
- README / AGENTS.md / docs を実装と同期する。

