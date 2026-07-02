import { createContext, type ReactNode, useContext } from "react";
import type { RepositorySet } from "../../repositories/contracts";
import { indexedDbRepositories } from "../../repositories/indexeddb/defaultRepositories";

const RepositoryContext = createContext<RepositorySet | null>(null);

export function RepositoryProvider({
  children,
  repositories = indexedDbRepositories,
}: {
  children: ReactNode;
  repositories?: RepositorySet;
}) {
  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositorySet {
  const repositories = useContext(RepositoryContext);
  if (!repositories) {
    throw new Error("useRepositories must be used inside RepositoryProvider.");
  }
  return repositories;
}
