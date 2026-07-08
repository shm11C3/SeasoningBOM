# ADR 0010: Use explicit inventory links for EOL Rescue

## Status

Accepted

## Context

The Cloud D1 MVP records Cooking Logs and Contribution events. It also needs `eol_rescued` contributions when a user cooks with food that is near best-before EOL.

EOL Rescue is derived from private Inventory data. Inferring it from recipe ingredient names would be low effort, but it can miscount when names differ, when several inventory items share a name, or when a user cooked the recipe without using a specific near-EOL item.

## Decision

Cooking Log creation accepts explicit owned `usedInventoryItemIds`.

Workers validate that every ID belongs to the signed-in user, store the links in `cooking_log_inventory_items`, and calculate lifecycle status at `cooked_at`. If any linked item is `deprecated`, the same D1 batch records one private `eol_rescued` contribution with `contribution_count = 2`.

The `eol_rescued` event is always private because it is inventory-derived. `unsupported` and `hazardous` items are not counted as rescues.

## Consequences

- EOL Rescue avoids ingredient-name inference and accidental contribution inflation.
- Public Cooking Log reads do not expose linked Inventory Item IDs or details.
- The frontend must pass explicit used inventory IDs when it wants EOL Rescue credit.
- Future quantity-consumption or per-item rescue counts can build on the join table without changing Cooking Log identity.
