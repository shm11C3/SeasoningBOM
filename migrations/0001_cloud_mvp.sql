PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  contribution_visibility TEXT NOT NULL DEFAULT 'summary_only',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(auth_provider, auth_subject),
  UNIQUE(username)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username
ON user_profiles(username);

CREATE TABLE IF NOT EXISTS recipe_repositories (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL,
  version TEXT NOT NULL,
  servings INTEGER NOT NULL,
  readme TEXT,
  license TEXT,
  source_repository_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(source_repository_id) REFERENCES recipe_repositories(id),
  UNIQUE(owner_user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_recipe_repositories_owner_slug
ON recipe_repositories(owner_user_id, slug);

CREATE INDEX IF NOT EXISTS idx_recipe_repositories_visibility
ON recipe_repositories(visibility);

CREATE TABLE IF NOT EXISTS recipe_components (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  required INTEGER NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_components_repository
ON recipe_components(repository_id);

CREATE TABLE IF NOT EXISTS ingredient_dependencies (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  dependency_name TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  FOREIGN KEY(component_id) REFERENCES recipe_components(id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_dependencies_component
ON ingredient_dependencies(component_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  best_before_date TEXT,
  use_by_date TEXT,
  hazardous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_user
ON inventory_items(user_id);

CREATE TABLE IF NOT EXISTS repository_stars (
  user_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, repository_id),
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);

CREATE INDEX IF NOT EXISTS idx_repository_stars_repository
ON repository_stars(repository_id);

CREATE TABLE IF NOT EXISTS contribution_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  repository_id TEXT,
  occurred_on TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  contribution_count INTEGER NOT NULL DEFAULT 1,
  visibility TEXT NOT NULL DEFAULT 'summary_only',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);

CREATE INDEX IF NOT EXISTS idx_contribution_events_user_date
ON contribution_events(user_id, occurred_on);

CREATE INDEX IF NOT EXISTS idx_contribution_events_repository
ON contribution_events(repository_id);

CREATE TABLE IF NOT EXISTS cooking_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT,
  cooked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user_profiles(id),
  FOREIGN KEY(repository_id) REFERENCES recipe_repositories(id)
);

CREATE INDEX IF NOT EXISTS idx_cooking_logs_user_cooked_at
ON cooking_logs(user_id, cooked_at);

CREATE INDEX IF NOT EXISTS idx_cooking_logs_repository
ON cooking_logs(repository_id);

CREATE TABLE IF NOT EXISTS cooking_log_inventory_items (
  cooking_log_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(cooking_log_id, inventory_item_id),
  FOREIGN KEY(cooking_log_id) REFERENCES cooking_logs(id),
  FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id)
);

CREATE INDEX IF NOT EXISTS idx_cooking_log_inventory_items_inventory_item
ON cooking_log_inventory_items(inventory_item_id);
