# SeasoningBOM Format

SeasoningBOM は、このアプリ独自の SBOM 風 JSON 形式です。

MVP では SPDX / CycloneDX 完全互換は目指しません。料理レシピをソフトウェアサプライチェーン風に表現するための、軽量で読みやすい snapshot format として設計します。

## Format Goals

1. レシピの直接依存材料を表現する。
2. 材料内部の推移的依存を表現する。
3. 生成時点の lifecycle status を含める。
4. `nom audit` の結果を含める。
5. JSON としてダウンロード・共有しやすくする。

## Non-Goals

- SPDX 完全互換
- CycloneDX 完全互換
- 暗号署名
- サーバー登録
- 長期監査ログ

## Top-Level Shape

```ts
type SeasoningBOM = {
  bomFormat: "SeasoningBOM";
  specVersion: "0.1.0";
  generatedAt: string;
  recipe: SeasoningBOMRecipe;
  components: SeasoningBOMComponent[];
  audit: SeasoningBOMAudit;
};
```

## Example

```json
{
  "bomFormat": "SeasoningBOM",
  "specVersion": "0.1.0",
  "generatedAt": "2026-07-01T12:00:00+09:00",
  "recipe": {
    "name": "curry-rice",
    "version": "1.2.0",
    "servings": 4
  },
  "components": [
    {
      "name": "curry-roux",
      "quantity": 0.5,
      "unit": "box",
      "dependencyType": "required",
      "lifecycle": {
        "eolDate": "2026-07-05",
        "status": "active"
      },
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
    "summary": {
      "totalIssues": 0,
      "critical": 0,
      "high": 0,
      "medium": 0,
      "low": 0
    },
    "issues": []
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
  lifecycle?: {
    eolDate?: string;
    useByDate?: string;
    status: LifecycleStatus;
  };
  allergens: Allergen[];
  dependencies: SeasoningBOMDependency[];
};
```

If matching inventory item is found:

- include lifecycle status
- include best-before date as `eolDate`
- include use-by date as `useByDate`

If no matching inventory item is found:

- omit `lifecycle`
- audit should include missing issue

## Dependency Mapping

```ts
type SeasoningBOMDependency = {
  name: string;
  dependencyType: "transitive" | "substitute" | "peer";
  allergens: Allergen[];
  notes?: string;
};
```

## Audit Mapping

```ts
type SeasoningBOMAudit = {
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: AuditIssue[];
};
```

## Generation Rules

- SeasoningBOM is generated on demand.
- SeasoningBOM is not stored in DB.
- `generatedAt` is the time of export.
- `specVersion` stays fixed at `0.1.0` for MVP.
- Output should be deterministic except for `generatedAt`.
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

