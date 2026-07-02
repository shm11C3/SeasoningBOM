import { useLiveQuery } from "dexie-react-hooks";
import { useRepositories } from "../app/providers/RepositoryProvider";
import { defaultSettings } from "../domain";

export function useLiveData() {
  const repositories = useRepositories();
  const recipes = useLiveQuery(() => repositories.recipes.findAll(), [repositories], []);
  const components = useLiveQuery(() => repositories.components.findAll(), [repositories], []);
  const inventoryItems = useLiveQuery(() => repositories.inventory.findAll(), [repositories], []);
  const settings = useLiveQuery(() => repositories.settings.get(), [repositories], defaultSettings);

  return {
    repositories,
    recipes: recipes ?? [],
    components: components ?? [],
    inventoryItems: inventoryItems ?? [],
    settings: settings ?? defaultSettings,
    ready: Boolean(recipes && components && inventoryItems && settings),
  };
}
