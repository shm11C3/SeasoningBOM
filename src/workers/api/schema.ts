export const cloudMvpTableNames = [
  "user_profiles",
  "recipe_repositories",
  "recipe_components",
  "ingredient_dependencies",
  "inventory_items",
  "repository_stars",
  "contribution_events",
  "cooking_logs",
  "cooking_log_inventory_items",
] as const;

export const cloudMvpRequiredIndexNames = [
  "idx_user_profiles_username",
  "idx_recipe_repositories_owner_slug",
  "idx_recipe_repositories_visibility",
  "idx_recipe_components_repository",
  "idx_ingredient_dependencies_component",
  "idx_inventory_items_user",
  "idx_repository_stars_repository",
  "idx_contribution_events_user_date",
  "idx_contribution_events_repository",
  "idx_cooking_logs_user_cooked_at",
  "idx_cooking_logs_repository",
  "idx_cooking_log_inventory_items_inventory_item",
] as const;

export type CloudMvpTableName = (typeof cloudMvpTableNames)[number];
export type CloudMvpRequiredIndexName = (typeof cloudMvpRequiredIndexNames)[number];
