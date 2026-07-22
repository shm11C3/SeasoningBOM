import { vi } from "vitest";
import type { SeasoningBomApiClient } from "../../repositories/cloud-api/SeasoningBomApiClient";

export function createCloudApiClientMock(
  overrides: Partial<SeasoningBomApiClient> = {},
): SeasoningBomApiClient {
  return {
    bootstrapProfile: vi.fn(),
    createInventoryItem: vi.fn(),
    createRepository: vi.fn(),
    deleteInventoryItem: vi.fn(),
    deleteRepository: vi.fn(),
    getCurrentProfile: vi.fn(),
    getPublicProfile: vi.fn(),
    getRepository: vi.fn(),
    getRepositoryBom: vi.fn(),
    getRepositoryDependencies: vi.fn(),
    getRepositorySecurity: vi.fn(),
    getUserContributionDay: vi.fn(),
    getUserContributions: vi.fn(),
    listInventory: vi.fn().mockResolvedValue([]),
    listPublicRepositories: vi.fn(),
    runRepositoryAudit: vi.fn().mockRejectedValue(new Error("Audit mock not configured.")),
    updateInventoryItem: vi.fn(),
    updateRepository: vi.fn(),
    ...overrides,
  };
}
