# UI Design

SeasoningBOM の UI は GitHub Repository 画面を料理レシピに置き換えることを中心に設計します。

UI ライブラリは `@primer/react` を採用します。アイコンは最終方針が決まるまで、内部の仮 SVG アイコンを使います。

## UI Concept

> If cooking were a software supply chain.

レシピ詳細画面は GitHub Repository ページ風にします。

- Recipe = Repository
- Ingredients = Dependencies
- Expiration warnings = Security alerts
- Recipe versions = Releases
- Cooking notes = Issues / Discussions
- Shopping list = `nom install`
- Audit = `nom audit`

## Visual Direction

MVP は「GitHub っぽさ」を優先します。

Characteristics:

- Header + tab navigation
- bordered cards
- labels
- severity colors
- monospace command output
- dependency tree
- README-style markdown area
- security alert list

## Main Screens

| Screen | Route | MVP |
| --- | --- | --- |
| Repository list | `/` | Yes |
| Repository detail | `/:owner/:repo` | Yes |
| Recipe editor | `/:owner/:repo/edit` | Yes |
| Inventory | `/inventory` | Yes |
| Security alerts | `/security` | Yes |
| EOL dashboard | `/eol` | Yes |
| Backup / Restore | `/backup` | Yes |

## Repository Detail Layout

```text
┌──────────────────────────────────────────────┐
│ me / curry-rice                              │
│ 家庭用カレーライスの安定版レシピ                 │
│ Public  v1.2.0  42 stars  3 forks  2 alerts │
├──────────────────────────────────────────────┤
│ Code | Dependencies | Security | Issues | ... │
├──────────────────────────────────────────────┤
│ selected tab content                         │
└──────────────────────────────────────────────┘
```

## Repository Header

Display:

- owner / repository name
- description
- public badge
- version
- tags
- stars-like count
- forks-like count
- security alert count

MVP note:

- stars / forks are joke metrics and can be deterministic fake values derived from recipe data, or omitted until P1.

## Tabs

| Tab | MVP | Purpose |
| --- | --- | --- |
| Code | Yes | README, materials, steps, actions |
| Dependencies | Yes | direct / transitive dependencies |
| Security | Yes | `nom audit` result |
| Issues | P1 |期限・改善メモ |
| Releases | P1 |レシピバージョン履歴 |
| Insights | P2 | EOL 救済率など |

## Code Tab

Code tab shows README-style recipe content.

Required sections:

1. Repository README
2. Ingredients
3. Cooking steps
4. Actions

Actions:

- `nom audit`
- `nom install`
- `Download SBOM`
- `Export recipe-lock.json` (disabled until P1)

Example:

```text
# Curry Rice

家庭用カレーライスの安定版レシピ。

## Install dependencies

- rice@2go
- curry-roux@half-box
- potato@3pieces

## Build

1. Checkout ingredients
2. Install dependencies
3. Build curry base
4. Deploy to table
```

## Dependencies Tab

Displays direct and transitive dependencies.

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

UI components:

- dependency type label
- quantity badge
- allergen label
- nested tree for transitive dependencies

## Security Tab

Displays public Recipe Alerts and, for the signed-in user, private Inventory Audit results.

Severity ordering:

1. critical
2. high
3. medium
4. low

Example:

```text
Security alerts

Recipe alerts

Medium
- curry-roux contains wheat

Low
- dependency tree depth is 2

Your inventory audit

High
- milk in your inventory reached EOL

Medium
- potato will reach EOL in 2 days
```

Privacy:

- Recipe Alerts are derived only from Repository content and follow Repository visibility.
- Inventory Audit details are shown only to the inventory owner.
- Public visitors must never see another user's EOL, unsupported, hazardous, missing, or quantity audit details.

## Inventory Screen

Displays fridge inventory as dependency packages installed locally.

Suggested copy:

```text
Installed ingredients
```

Columns:

- name
- category
- quantity
- best before / EOL
- use by / unsupported date
- lifecycle status
- actions

## Security Alerts Screen

Shows the signed-in user's cross-recipe Inventory Audit result.

MVP:

- run audit for visible recipes using the current user's inventory
- group by severity
- link back to recipe detail

## EOL Dashboard

Shows ingredients approaching EOL.

Groups:

- Deprecated
- EOL
- Unsupported
- Hazardous

Important:

- Unsupported / hazardous are displayed as urgent warnings, not as "use quickly" recommendations.

## Backup / Restore Screen

Actions:

- Export all data as JSON
- Import backup JSON

Import UI must show:

- backup version
- counts
- conflict strategy: overwrite / duplicate
- warning that overwrite replaces existing matching IDs

## Copywriting Guidelines

The app can be funny, but food safety copy must remain responsible.

Good:

- `chicken is unsupported and will not be used in recommendations`
- `milk will reach EOL tomorrow`
- `nom audit found 3 issues`

Avoid:

- `期限切れだけどいける`
- `消費期限切れを救済`
- `危険だけどネタなので使う`

## Primer Usage Policy

Use Primer for:

- layout primitives
- buttons
- labels
- dialogs
- tabs
- forms
- temporary internal SVG icons

Avoid:

- Large custom CSS before Primer options are exhausted.
- Reimplementing common GitHub-like components from scratch.

## Accessibility

MVP baseline:

- Buttons have accessible labels.
- Alerts are not color-only.
- Forms have labels and validation messages.
- Keyboard navigation works for tabs and dialogs.
- Severity is shown by both text and color.
