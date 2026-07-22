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
    forkRepository: vi.fn(),
    getCurrentProfile: vi.fn(),
    getPublicProfile: vi.fn(),
    getRepository: vi.fn(),
    getRepositoryBom: vi.fn(),
    getRepositoryDependencies: vi.fn(),
    getRepositorySecurity: vi.fn(),
    getRepositoryStar: vi.fn().mockRejectedValue(new Error("Star mock not configured.")),
    getUserContributionDay: vi.fn(),
    getUserContributions: vi.fn(),
    listInventory: vi.fn().mockResolvedValue([]),
    listPublicRepositories: vi.fn(),
    runRepositoryAudit: vi.fn().mockRejectedValue(new Error("Audit mock not configured.")),
    starRepository: vi.fn(),
    unstarRepository: vi.fn(),
    updateInventoryItem: vi.fn(),
    updateRepository: vi.fn(),
    ...overrides,
  };
}
