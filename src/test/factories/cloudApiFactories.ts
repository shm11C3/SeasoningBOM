import { vi } from "vitest";
import type { SeasoningBomApiClient } from "../../repositories/cloud-api/SeasoningBomApiClient";

export function createCloudApiClientMock(
  overrides: Partial<SeasoningBomApiClient> = {},
): SeasoningBomApiClient {
  return {
    bootstrapProfile: vi.fn(),
    createRepository: vi.fn(),
    deleteRepository: vi.fn(),
    getCurrentProfile: vi.fn(),
    getPublicProfile: vi.fn(),
    getRepository: vi.fn(),
    getRepositoryBom: vi.fn(),
    getRepositoryDependencies: vi.fn(),
    getRepositorySecurity: vi.fn(),
    getUserContributionDay: vi.fn(),
    getUserContributions: vi.fn(),
    listPublicRepositories: vi.fn(),
    updateRepository: vi.fn(),
    ...overrides,
  };
}
