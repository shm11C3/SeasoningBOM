import { createContext, type ReactNode, useContext } from "react";
import {
  createSeasoningBomApiClient,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";

const configuredCloudApiClient = createSeasoningBomApiClient(
  import.meta.env.VITE_SEASONINGBOM_API_BASE_URL,
);
const CloudApiContext = createContext<SeasoningBomApiClient | null>(configuredCloudApiClient);

export function CloudApiProvider({
  children,
  client = configuredCloudApiClient,
}: {
  children: ReactNode;
  client?: SeasoningBomApiClient | null;
}) {
  return <CloudApiContext.Provider value={client}>{children}</CloudApiContext.Provider>;
}

export function useCloudApi(): SeasoningBomApiClient | null {
  return useContext(CloudApiContext);
}
