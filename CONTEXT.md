# SeasoningBOM Context

SeasoningBOM is a GitHub-parody recipe sharing service for engineers. It describes recipes, ingredients, food-safety signals, and cooking activity using repository and software supply-chain language.

## Language

**Recipe Repository**:
A shareable repository-like container for a recipe, its ingredients, instructions, metadata, visibility, stars, forks, and generated SeasoningBOM. A **Recipe Repository** has exactly one owner and may have zero or one source repository when forked.
_Avoid_: Cookbook entry, project, package

**Repository Owner**:
The user that owns a **Recipe Repository** and provides the first part of the repository's canonical identity. A repository is addressed by owner plus slug, not by slug alone.
_Avoid_: Maintainer when referring to access ownership

**User Handle**:
The stable SeasoningBOM username reserved for a user and used in URLs such as `/:owner/:repo` and `/users/:username`. P0 initializes it from the GitHub OAuth login, stores it normalized, and does not automatically change it if the GitHub username changes.
_Avoid_: Live GitHub username when referring to stable SeasoningBOM URLs

**Repository Slug**:
The URL-safe repository name within a single owner's namespace. A slug can be reused by different owners, so it is never globally unique by itself.
_Avoid_: Global repository ID

**Recipe**:
The concrete food preparation content inside a **Recipe Repository**, including ingredients, quantities, servings, and steps. In casual UI copy this may overlap with **Recipe Repository**, but model decisions should keep the repository wrapper distinct from the recipe content.
_Avoid_: Repository when referring only to cooking content

**Component**:
An ingredient required or referenced by a recipe. Components can be direct dependencies and may also describe transitive ingredient dependencies.
_Avoid_: Package, module, material

**Direct Dependency**:
A component that the recipe directly lists as an ingredient.
_Avoid_: Ingredient dependency when the dependency is directly listed

**Transitive Dependency**:
An ingredient or allergen-bearing dependency contained inside a direct dependency.
_Avoid_: Nested ingredient when discussing audit or dependency graph behavior

**Inventory Item**:
A user's private record of a food item they have available, including quantity, unit, lifecycle dates, and hazardous flag. Inventory is personal data and is not part of public repository content.
_Avoid_: Public ingredient, repository component

**Lifecycle Status**:
The computed status of an inventory item: active, deprecated, eol, unsupported, or hazardous. It is derived from dates and hazard flags rather than treated as independent content.
_Avoid_: Stored status, expiration state

**EOL**:
The best-before date concept rendered as "End of Life" parody language. EOL is not the same as use-by expiration.
_Avoid_: Expiration when specifically referring to best-before dates

**Unsupported**:
The state where a use-by date has passed. Unsupported food should not be recommended or counted as available.
_Avoid_: EOL, deprecated

**Hazardous**:
The state where a user has manually marked an inventory item as dangerous. Hazardous food is treated as unavailable.
_Avoid_: Critical alert when referring to the underlying inventory state

**Security Alert**:
A repository-style warning surface. When modeling or serializing the warning, keep the source explicit as either a **Recipe Alert** or an **Inventory Audit** issue so public recipe data and private inventory data are never collapsed.
_Avoid_: Vulnerability when it could imply real CVE/SPDX semantics

**Recipe Alert**:
A public or repository-visibility-scoped alert derived only from Recipe Repository content, such as allergens, transitive dependencies, dependency depth, declared substitutes, or joke license metadata. Recipe Alerts may be shown on public repositories and may be included in SeasoningBOM.
_Avoid_: Inventory audit

**Inventory Audit**:
A viewer-private audit derived from a Recipe Repository, that user's Inventory Items, and a caller-provided time. It includes EOL, unsupported, hazardous, missing, quantity, and substitute availability checks. Inventory Audit details are visible only to the inventory owner and must not be included in public SeasoningBOM.
_Avoid_: Public security alert

**SeasoningBOM**:
The service's SBOM-style JSON snapshot for a recipe repository. It contains recipe dependencies and public Recipe Alerts, but not a user's private Inventory Audit details.
_Avoid_: CycloneDX, SPDX, backup

**SeasoningBOMAppBackup**:
An app-data transfer JSON for backup and restore. This is separate from the recipe-level **SeasoningBOM** snapshot.
_Avoid_: SeasoningBOM

**Fork**:
A new recipe repository derived from another public repository. A fork keeps a source repository relationship visible.
_Avoid_: Copy when the source relationship matters

**Star**:
A lightweight appreciation signal on a public recipe repository. Stars are not contributions because they are consumption rather than cooking or creation activity.
_Avoid_: Contribution

**Cooking Log**:
A user's record that they cooked a repository's recipe. Cooking logs may create contributions and can have privacy implications.
_Avoid_: Commit when referring to the domain event itself

**Contribution**:
A counted cooking or recipe-creation activity shown on a GitHub-style contribution graph. Contributions include events such as recipe creation, recipe updates, cooking logs, EOL rescues, and forks.
_Avoid_: Star, page view, login

**EOL Rescue**:
A contribution-worthy cooking activity where a user uses an inventory item close to EOL before it becomes waste. EOL Rescue can reveal private inventory context and therefore needs privacy-aware display.
_Avoid_: Food safety bypass

**Visibility**:
The repository access mode: public, private, or unlisted. Visibility controls repository content access; it does not make a user's inventory public.
_Avoid_: Privacy setting when specifically discussing repository access

**Contribution Visibility**:
The profile-level visibility of contribution graph details. The default is summary-only so the graph can be visible without exposing private cooking logs or inventory-derived details.
_Avoid_: Repository visibility

## Example Dialogue

Developer: "Can we show all security alerts on a public Recipe Repository?"

Domain expert: "Show public recipe alerts such as allergens and transitive dependencies, but do not expose another user's Inventory Items. Inventory-derived audit details are only for that user."

Developer: "If a user stars a repository, does that grow their contribution graph?"

Domain expert: "No. A Star is appreciation, not cooking or creation. A Cooking Log, EOL Rescue, recipe update, or repository fork can count as a Contribution."

Developer: "Can the SeasoningBOM include what is in my fridge?"

Domain expert: "No. SeasoningBOM is a recipe snapshot. Private inventory stays out of public recipe artifacts."
