# SeasoningBOM Documentation

設計ドキュメントの入口です。原則として、実装はこれらのドキュメントに従います。実装とドキュメントが食い違う場合は、ドキュメントを更新するか、ADR で理由を残します。

## Design Docs

| Doc | Purpose |
| --- | --- |
| [overview.md](overview.md) | コンセプト、ゴール、設計原則 |
| [architecture.md](architecture.md) | レイヤ構成、技術選定、データフロー、テスト方針 |
| [data-model.md](data-model.md) | エンティティと型定義 |
| [domain-logic.md](domain-logic.md) | lifecycle 判定、`nom audit`、SeasoningBOM 生成などの純粋ロジック |
| [repository-layer.md](repository-layer.md) | 永続化抽象、Cloud D1 実装方針、IndexedDB prototype adapter |
| [ui-design.md](ui-design.md) | GitHub 風 UI、画面、コピーガイド |
| [seasoning-bom-format.md](seasoning-bom-format.md) | SeasoningBOM JSON 形式仕様 |
| [glossary.md](glossary.md) | 用語集と命名ルール |
| [roadmap.md](roadmap.md) | フェーズ計画と優先順位 |
| [deployment.md](deployment.md) | Cloudflare Pages / Workers / D1 のローカル開発・配備手順 |
| [release-checklist.md](release-checklist.md) | Cloud MVP 公開前の検証項目 |
| [seasoningbom_requirements_cloud_d1.md](seasoningbom_requirements_cloud_d1.md) | 現在の Cloud D1 MVP 要件一覧 |
| [requirements.md](requirements.md) | 元の local-first 要件一覧（履歴） |

## Architecture Decision Records

| ADR | Title |
| --- | --- |
| [0001](adr/0001-web-first-react-vite.md) | Web-first React + Vite architecture |
| [0002](adr/0002-primer-for-github-like-ui.md) | Use Primer for GitHub-like UI |
| [0003](adr/0003-dexie-indexeddb-repository-layer.md) | Dexie-backed IndexedDB behind Repository contracts |
| [0004](adr/0004-domain-logic-as-pure-functions.md) | Keep domain logic as pure functions |
| [0005](adr/0005-cloudflare-d1-recipe-sharing-mvp.md) | Cloudflare D1 recipe sharing MVP |
| [0006](adr/0006-split-recipe-alerts-and-inventory-audits.md) | Split public Recipe Alerts and private Inventory Audits |
| [0007](adr/0007-stable-user-handles-for-repository-urls.md) | Stable User Handles for Repository URLs |
| [0008](adr/0008-clerk-social-auth-for-cloud-mvp.md) | Clerk social authentication for the Cloud MVP |
| [0009](adr/0009-hono-for-worker-routing.md) | Use Hono for Worker API routing |
| [0010](adr/0010-explicit-inventory-links-for-eol-rescue.md) | Use explicit inventory links for EOL Rescue |
| [0011](adr/0011-granular-dependency-mutation-api.md) | Use full replacement for granular dependency mutations |
| [0012](adr/0012-atomic-recipe-editor-manifests.md) | Save recipe editor manifests atomically |
| [0013](adr/0013-atomic-repository-fork-snapshots.md) | Clone complete repository snapshots when forking |
| [0014](adr/0014-single-package-runtime-boundaries.md) | Enforce runtime boundaries inside one package |

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
