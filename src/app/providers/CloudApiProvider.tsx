import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  createSeasoningBomApiClient,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { useAppAuth } from "./AuthProvider";

const CloudApiContext = createContext<SeasoningBomApiClient | null>(null);

export function CloudApiProvider({
  baseUrl = import.meta.env.VITE_SEASONINGBOM_API_BASE_URL,
  children,
  client,
  fetcher = fetch,
}: {
  baseUrl?: string;
  children: ReactNode;
  client?: SeasoningBomApiClient | null;
  fetcher?: typeof fetch;
}) {
  const auth = useAppAuth();
  const configuredClient = useMemo(
    () => createSeasoningBomApiClient(baseUrl, fetcher, auth.getToken),
    [auth.getToken, baseUrl, fetcher],
  );

  return (
    <CloudApiContext.Provider value={client === undefined ? configuredClient : client}>
      {children}
    </CloudApiContext.Provider>
  );
}

export function useCloudApi(): SeasoningBomApiClient | null {
  return useContext(CloudApiContext);
}
