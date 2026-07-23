PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO user_profiles (
  id,
  auth_provider,
  auth_subject,
  username,
  display_name,
  contribution_visibility,
  created_at,
  updated_at
) VALUES (
  'profile_public_examples',
  'clerk',
  'seed:seasoning-demo',
  'seasoning-demo',
  'SeasoningBOM Examples',
  'public',
  '2026-07-01T00:00:00.000Z',
  '2026-07-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO recipe_repositories (
  id,
  owner_user_id,
  name,
  slug,
  description,
  visibility,
  version,
  servings,
  readme,
  license,
  created_at,
  updated_at
) VALUES
  (
    'repo_example_curry',
    'profile_public_examples',
    'Curry Rice',
    'curry-rice',
    'A stable weeknight curry with explicit transitive allergens.',
    'public',
    '1.2.0',
    4,
    '# Curry Rice

## Build

1. Checkout ingredients.
2. Install dependencies.
3. Build curry base.
4. Deploy to table.',
    'Mother''s Taste License',
    '2026-07-01T00:00:00.000Z',
    '2026-07-01T00:00:00.000Z'
  ),
  (
    'repo_example_soup',
    'profile_public_examples',
    'EOL Rescue Soup',
    'eol-rescue-soup',
    'A conservative soup recipe for vegetables approaching best-before EOL.',
    'public',
    '1.0.0',
    3,
    '# EOL Rescue Soup

Use only supported, non-hazardous ingredients. A passed use-by date is never a rescue candidate.',
    'MIT-Meal',
    '2026-07-02T00:00:00.000Z',
    '2026-07-02T00:00:00.000Z'
  );

INSERT OR IGNORE INTO recipe_components (
  id,
  repository_id,
  ingredient_name,
  quantity,
  unit,
  dependency_type,
  required,
  allergens_json,
  alternatives_json,
  created_at,
  updated_at
) VALUES
  ('component_example_rice', 'repo_example_curry', 'rice', 2, 'go', 'required', 1, '[]', '[]', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
  ('component_example_roux', 'repo_example_curry', 'curry-roux', 0.5, 'box', 'required', 1, '[]', '["curry powder"]', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
  ('component_example_potato', 'repo_example_curry', 'potato', 3, 'piece', 'required', 1, '[]', '["sweet potato"]', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
  ('component_example_cabbage', 'repo_example_soup', 'cabbage', 0.25, 'head', 'required', 1, '[]', '["bok choy"]', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'),
  ('component_example_carrot', 'repo_example_soup', 'carrot', 2, 'piece', 'required', 1, '[]', '[]', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'),
  ('component_example_stock', 'repo_example_soup', 'vegetable-stock', 600, 'ml', 'required', 1, '["celery"]', '["water"]', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z');

INSERT OR IGNORE INTO ingredient_dependencies (
  id,
  component_id,
  dependency_name,
  dependency_type,
  allergens_json,
  notes
) VALUES
  ('dependency_example_wheat', 'component_example_roux', 'wheat', 'transitive', '["wheat"]', 'Declared by curry roux'),
  ('dependency_example_milk', 'component_example_roux', 'milk', 'transitive', '["milk"]', 'Declared by curry roux'),
  ('dependency_example_soy', 'component_example_roux', 'soy', 'transitive', '["soy"]', 'Declared by curry roux'),
  ('dependency_example_celery', 'component_example_stock', 'celery', 'transitive', '["celery"]', 'Declared by vegetable stock');

INSERT OR IGNORE INTO contribution_events (
  id,
  user_id,
  event_type,
  repository_id,
  occurred_on,
  occurred_at,
  contribution_count,
  visibility,
  metadata_json
) VALUES
  ('contribution_example_curry', 'profile_public_examples', 'recipe_created', 'repo_example_curry', '2026-07-01', '2026-07-01T00:00:00.000Z', 1, 'public', '{"ownerHandle":"seasoning-demo","slug":"curry-rice","name":"Curry Rice","version":"1.2.0"}'),
  ('contribution_example_soup', 'profile_public_examples', 'recipe_created', 'repo_example_soup', '2026-07-02', '2026-07-02T00:00:00.000Z', 1, 'public', '{"ownerHandle":"seasoning-demo","slug":"eol-rescue-soup","name":"EOL Rescue Soup","version":"1.0.0"}');
