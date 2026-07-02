import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryProvider } from "../app/providers/RepositoryProvider";
import { defaultSettings } from "../domain";
import { createMemoryRepositories } from "../repositories/memory/MemoryRepositories";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../test/factories/domainFactories";
import { useLiveData } from "./useLiveData";

const liveQueryMock = vi.hoisted(() => ({
  useLiveQuery: vi.fn(),
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: liveQueryMock.useLiveQuery,
}));

function createWrapper(repositories = createMemoryRepositories()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <RepositoryProvider repositories={repositories}>{children}</RepositoryProvider>;
  };
}

describe("useLiveData", () => {
  beforeEach(() => {
    liveQueryMock.useLiveQuery.mockReset();
  });

  it("returns live query values and marks the app as ready", () => {
    const repositories = createMemoryRepositories();
    const recipes = [makeRecipe()];
    const components = [makeComponent()];
    const inventoryItems = [makeInventoryItem()];
    const settings = makeSettings({ deprecatedThresholdDays: 2 });

    liveQueryMock.useLiveQuery
      .mockReturnValueOnce(recipes)
      .mockReturnValueOnce(components)
      .mockReturnValueOnce(inventoryItems)
      .mockReturnValueOnce(settings);

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper(repositories) });

    expect(result.current).toMatchObject({
      repositories,
      recipes,
      components,
      inventoryItems,
      settings,
      ready: true,
    });
  });

  it("uses empty/default values until every live query has produced data", () => {
    liveQueryMock.useLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() });

    expect(result.current).toMatchObject({
      recipes: [],
      components: [],
      inventoryItems: [],
      settings: defaultSettings,
      ready: false,
    });
  });
});
