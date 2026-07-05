# SeasoningBOM Format

SeasoningBOM は、このアプリ独自の SBOM 風 JSON 形式です。

MVP では SPDX / CycloneDX 完全互換は目指しません。料理レシピをソフトウェアサプライチェーン風に表現するための、軽量で読みやすい snapshot format として設計します。

## Format Goals

1. レシピの直接依存材料を表現する。
2. 材料内部の推移的依存を表現する。
3. Repository 内容だけから生成できる public Recipe Alert を含める。
4. Private Inventory や Inventory Audit を含めない。
5. JSON としてダウンロード・共有しやすくする。

## Non-Goals

- SPDX 完全互換
- CycloneDX 完全互換
- 暗号署名
- サーバー登録
- 長期監査ログ
- private inventory export
- Inventory Audit results

## Top-Level Shape

```ts
type SeasoningBOM = {
  bomFormat: "SeasoningBOM";
  specVersion: "0.1.0";
  generatedAt: string;
  repository: SeasoningBOMRepository;
  components: SeasoningBOMComponent[];
  audit: SeasoningBOMRecipeAudit;
};

type SeasoningBOMRepository = {
  owner: string;
  name: string;
  version: string;
  visibility: "public" | "private" | "unlisted";
};
```

## Example

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
      "allergens": [],
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
    "issues": [
      {
        "id": "curry-roux-transitive-dependency-wheat",
        "severity": "medium",
        "category": "transitive-dependency",
        "componentName": "curry-roux",
        "message": "curry-roux contains transitive dependency: wheat"
      }
    ]
  }
}
```

## Component Mapping

`RecipeComponent` から SeasoningBOM component を生成します。

```ts
type SeasoningBOMComponent = {
  name: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: Allergen[];
  dependencies: SeasoningBOMDependency[];
};
```

SeasoningBOM components are generated from repository recipe data only. Do not enrich them with a viewer's Inventory Item lifecycle status.

## Dependency Mapping

```ts
type SeasoningBOMDependency = {
  name: string;
  dependencyType: "transitive" | "substitute" | "peer";
  allergens: Allergen[];
  notes?: string;
};
```

## Recipe Alert Mapping

```ts
type SeasoningBOMRecipeAudit = {
  issues: RecipeAlert[];
};
```

Only public Recipe Alerts can appear here. Inventory Audit issues such as EOL, unsupported, hazardous, missing, and quantity shortage are private user data and must not appear in SeasoningBOM.

## Generation Rules

- SeasoningBOM is generated on demand.
- SeasoningBOM is not stored in DB.
- `generatedAt` is the time of export.
- `specVersion` stays fixed at `0.1.0` for MVP.
- Output should be deterministic except for `generatedAt`.
- Output follows Repository visibility, but even owner-generated exports exclude private Inventory Audit details by default.
- Components should be sorted by recipe order.
- Dependencies should be sorted by recipe-defined order.

## File Naming

Recommended download file name:

```text
<recipe-slug>-seasoningbom.json
```

Example:

```text
curry-rice-seasoningbom.json
```

## Compatibility Policy

When changing the format:

- Add a new `specVersion`.
- Keep old import / display compatibility when practical.
- Document changes in this file.

MVP does not import SeasoningBOM files as app backups. For full data transfer, use `SeasoningBOMAppBackup` instead.
