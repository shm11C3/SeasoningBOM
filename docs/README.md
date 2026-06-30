# SeasoningBOM Documentation

設計ドキュメントの入口です。原則として、実装はこれらのドキュメントに従います。実装とドキュメントが食い違う場合は、ドキュメントを更新するか、ADR で理由を残します。

## Design Docs

| Doc | Purpose |
| --- | --- |
| [overview.md](overview.md) | コンセプト、ゴール、設計原則 |
| [architecture.md](architecture.md) | レイヤ構成、技術選定、データフロー、テスト方針 |
| [data-model.md](data-model.md) | エンティティと型定義 |
| [domain-logic.md](domain-logic.md) | lifecycle 判定、`nom audit`、SeasoningBOM 生成などの純粋ロジック |
| [repository-layer.md](repository-layer.md) | 永続化抽象と IndexedDB 実装方針 |
| [ui-design.md](ui-design.md) | GitHub 風 UI、画面、コピーガイド |
| [seasoning-bom-format.md](seasoning-bom-format.md) | SeasoningBOM JSON 形式仕様 |
| [glossary.md](glossary.md) | 用語集と命名ルール |
| [roadmap.md](roadmap.md) | フェーズ計画と優先順位 |
| [requirements.md](requirements.md) | 元の要件一覧（一次情報） |

## Architecture Decision Records

| ADR | Title |
| --- | --- |
| [0001](adr/0001-web-first-react-vite.md) | Web-first React + Vite architecture |
| [0002](adr/0002-primer-for-github-like-ui.md) | Use Primer for GitHub-like UI |
| [0003](adr/0003-dexie-indexeddb-repository-layer.md) | Dexie-backed IndexedDB behind Repository contracts |
| [0004](adr/0004-domain-logic-as-pure-functions.md) | Keep domain logic as pure functions |

## Reading Order

初めて読む場合の推奨順:

1. `overview.md`
2. `architecture.md`
3. `data-model.md`
4. `domain-logic.md`
5. `repository-layer.md`
6. `ui-design.md`
7. `seasoning-bom-format.md`
8. `glossary.md`
9. `roadmap.md`

