# Roadmap

SeasoningBOM は Web 先行で MVP を構築し、その後にネタ強化・モバイル対応・データ連携を追加します。

## Phase 0: Design Baseline

Goal: 実装前に設計と開発ルールを固める。

Deliverables:

- README
- AGENTS.md
- Architecture docs
- Data model docs
- Domain logic docs
- Repository layer docs
- UI design docs
- Glossary
- ADRs

Status: done

## Phase 1: Project Scaffold

Goal: React + Vite + TypeScript の空プロジェクトを構築し、品質ツールを整える。

Deliverables:

- Vite React TypeScript setup
- pnpm setup
- Biome setup
- Vitest setup
- GitHub Actions CI
- Primer setup
- Dexie setup
- initial folder structure

Exit criteria:

- `pnpm install` works
- `pnpm check` works
- `pnpm test` works
- empty app renders

Status: done

## Phase 2: Domain Core

Goal: UI より先に純粋関数を固める。

Deliverables:

- Type definitions
- lifecycle status function
- `nom audit`
- `nom install` shopping list generation
- SeasoningBOM generation
- recipe recommendation scoring
- unit tests

Exit criteria:

- lifecycle rules are covered by tests
- audit acceptance conditions pass
- SeasoningBOM sample output matches docs

Status: done

## Phase 3: Local Persistence

Goal: IndexedDB でデータ保存できるようにする。

Deliverables:

- Dexie schema
- Repository contracts
- IndexedDB repository implementations
- memory repositories for tests
- backup export / import

Exit criteria:

- recipe can be saved and reloaded
- inventory can be saved and reloaded
- backup export/import round trip works

Status: done

## Phase 4: MVP UI

Goal: GitHub 風 UI で主要体験を完成させる。

Deliverables:

- repository list
- recipe repository detail
- Code tab
- Dependencies tab
- Security tab
- recipe editor
- inventory screen
- backup / restore screen

Exit criteria:

- user can create recipe
- user can create inventory item
- user can run `nom audit`
- user can download SeasoningBOM

Status: done

## Phase 5: Polish and Public Release

Goal: ジョークアプリとして公開可能な状態にする。

Status: current phase

Deliverables:

- example recipes
- screenshots / demo GIF
- README usage section
- accessibility pass
- responsive layout pass
- release checklist

Exit criteria:

- fresh clone setup works
- demo flow is documented
- CI is green
- license and contribution docs are present

## P1 Features

After MVP:

- recipe version history
- recipe diff
- `recipe-lock.json`
- dependency graph visualization
- audit result history
- EOL calendar
- shareable audit result image
- README-style recipe page improvements
- tags / license / maintainer fields
- Issues-style warnings
- Pull Request-style recipe suggestions
- Releases tab

## P2 Features

Longer-term / joke expansion:

- more precise GitHub-like repository UI
- Discussions-style cooking notes
- Actions-style cooking workflow
- CHANGELOG-style recipe history
- `nom outdated`
- `nom dedupe`
- `nom ci`
- barcode scanning
- receipt OCR
- cloud sync
- mobile SQLite implementation

## Prioritization Rule

When uncertain, prioritize in this order:

1. Food safety correctness
2. Domain core testability
3. GitHub-like joke clarity
4. Local-first data durability
5. Visual polish
6. Future extensibility
