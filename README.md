# SeasoningBOM

> If cooking were a software supply chain.

SeasoningBOM is a local-first joke recipe app that treats recipes like GitHub repositories, ingredients like dependencies, expiration dates like EOL, and food safety checks like `nom audit`.

料理を **Repository**、材料を **Dependencies**、賞味期限を **EOL**、監査を **`nom audit`** として扱う、GitHub 風のネタ系レシピ管理アプリです。

## Concept

```text
curry-rice@1.2.0
├── rice@2go
├── curry-roux@half-box
│   ├── wheat
│   ├── milk
│   └── soy
├── potato@3pieces
├── carrot@1piece
└── pork@300g
```

SeasoningBOM helps you:

- manage recipes as GitHub-like repositories
- manage fridge inventory locally
- detect ingredients nearing EOL
- avoid unsupported ingredients past their use-by date
- detect allergens and transitive ingredient dependencies
- generate a SeasoningBOM JSON snapshot
- create a shopping list with `nom install`

It is a joke app, but food safety is not a joke: expired use-by ingredients are treated as unsupported and are not recommended.

## Product Status

Current phase: **design baseline**.

This repository currently contains product and architecture documentation. The implementation scaffold will be added in a later phase.

## Planned Tech Stack

| Area | Decision |
| --- | --- |
| Language | TypeScript |
| UI | React |
| Build | Vite |
| UI library | `@primer/react` |
| Icons | `@primer/octicons-react` |
| Web storage | IndexedDB |
| IndexedDB wrapper | Dexie.js |
| React data binding | `dexie-react-hooks` / `useLiveQuery` |
| Package manager | pnpm |
| Lint / Format | Biome |
| Test | Vitest + Testing Library |
| CI | GitHub Actions |

## MVP Scope

MVP includes:

- recipe repository CRUD
- inventory CRUD
- lifecycle status calculation
- `nom audit`
- EOL / unsupported / hazardous / allergen / missing ingredient detection
- recipe recommendation using ingredients near EOL
- SeasoningBOM JSON download
- local IndexedDB persistence
- backup / restore JSON
- GitHub-like repository detail UI
- Code / Dependencies / Security tabs

MVP excludes:

- account system
- cloud sync
- real SPDX / CycloneDX compatibility
- nutrition database integration
- barcode scanning
- receipt OCR
- AI recipe generation
- mobile SQLite implementation

## Documentation

Start here:

- [Documentation index](docs/README.md)
- [Overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Domain Logic](docs/domain-logic.md)
- [Repository Layer](docs/repository-layer.md)
- [UI Design](docs/ui-design.md)
- [SeasoningBOM Format](docs/seasoning-bom-format.md)
- [Glossary](docs/glossary.md)
- [Roadmap](docs/roadmap.md)

Architecture decisions:

- [ADR 0001: Web-first React + Vite architecture](docs/adr/0001-web-first-react-vite.md)
- [ADR 0002: Use Primer for GitHub-like UI](docs/adr/0002-primer-for-github-like-ui.md)
- [ADR 0003: Dexie-backed IndexedDB behind Repository contracts](docs/adr/0003-dexie-indexeddb-repository-layer.md)
- [ADR 0004: Keep domain logic as pure functions](docs/adr/0004-domain-logic-as-pure-functions.md)

Original requirements:

- [SeasoningBOM requirements](docs/requirements.md)

## Core Terms

| Cooking | Software joke |
| --- | --- |
| Recipe | Repository |
| Ingredient | Dependency |
| Ingredient inside another ingredient | Transitive dependency |
| Best-before date | EOL |
| Use-by date passed | Unsupported |
| Fridge inventory | Installed packages |
| Recipe audit | `nom audit` |
| Shopping list | `nom install` |
| Same-taste reproduction | `recipe-lock.json` |

## Safety Policy

SeasoningBOM uses software lifecycle jokes, but food safety behavior must remain conservative.

- Use-by date passed → `unsupported`
- User-marked dangerous item → `hazardous`
- `unsupported` and `hazardous` ingredients are excluded from recommendations
- The app must not encourage users to consume unsafe food

## License

This repository is licensed under the [MIT License](LICENSE).

In-app joke licenses such as "Mother's Taste License" are recipe metadata jokes and are not the source code license.
