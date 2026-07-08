import { describe, expect, it } from "vitest";
import type { CloudContributionEvent } from "../../repositories/cloudflare-d1/D1ContributionEvent";
import type {
  CloudInventoryItem,
  CreateInventoryItemInput,
  InventoryItemRepository,
  UpdateInventoryItemInput,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import type { RecipeComponentWriteRepository } from "../../repositories/cloudflare-d1/D1RecipeComponentRepository";
import type {
  CloudRecipeRepository,
  CreateRecipeRepositoryInput,
  RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import type { RepositoryStarRepository } from "../../repositories/cloudflare-d1/D1RepositoryStarRepository";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkAuthenticationOptions } from "../auth/clerk";
import {
  handleDeleteRepository,
  handleDeleteRepositoryStar,
  handleGetRepository,
  handleGetRepositoryBom,
  handleGetRepositoryDependencies,
  handleGetRepositorySecurity,
  handleListRepositories,
  handlePatchRepository,
  handlePostRepository,
  handlePostRepositoryAudit,
  handlePostRepositoryFork,
  handlePostRepositoryStar,
  handlePutRepositoryDependencies,
} from "./repositories";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
  CLERK_AUTHORIZED_PARTIES: "https://example.test",
  CLERK_JWT_KEY: "test-jwt-key",
};

const owner: UserProfile = {
  authProvider: "clerk",
  authSubject: "user_test",
  contributionVisibility: "summary_only",
  createdAt: "2026-07-06T00:00:00.000Z",
  id: "profile_test",
  updatedAt: "2026-07-06T00:00:00.000Z",
  username: "test-user",
};

const validSessionAuth: ClerkAuthenticationOptions = {
  verifyToken: async () =>
    ({
      azp: "https://example.test",
      sid: "sess_test",
      sub: "user_test",
    }) as Awaited<ReturnType<NonNullable<ClerkAuthenticationOptions["verifyToken"]>>>,
};

const privateRepository: CloudRecipeRepository = {
  createdAt: "2026-07-06T00:00:00.000Z",
  id: "repo_private",
  maintainer: "test-user",
  name: "Private Curry",
  ownerHandle: "test-user",
  ownerUserId: "profile_test",
  servings: 2,
  slug: "private-curry",
  tags: [],
  updatedAt: "2026-07-06T00:00:00.000Z",
  version: "0.1.0",
  visibility: "private",
};

const recipeComponent = {
  allergens: ["wheat"],
  alternatives: ["homemade roux"],
  dependencyType: "required",
  id: "component_roux",
  ingredientName: "curry-roux",
  quantity: 1,
  recipeId: "repo_private",
  required: true,
  transitiveDependencies: [
    {
      allergens: ["milk"],
      dependencyType: "transitive",
      name: "milk powder",
      notes: "Often hidden in roux blocks.",
    },
  ],
  unit: "box",
} satisfies Awaited<ReturnType<RecipeComponentWriteRepository["listByRepositoryId"]>>[number];

const inventoryItem: CloudInventoryItem = {
  category: "grain",
  createdAt: "2026-07-06T00:00:00.000Z",
  hazardous: false,
  id: "inventory_rice",
  name: "Rice",
  quantity: 2,
  unit: "go",
  updatedAt: "2026-07-06T00:00:00.000Z",
  userId: "profile_test",
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("repository API handlers", () => {
  it("returns a JSON error when public repository listing fails", async () => {
    const response = await handleListRepositories(env, {
      recipeRepositories: {
        ...createRecipeRepository([]),
        async listPublic() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load repositories.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when repository lookup fails", async () => {
    const response = await handleGetRepository(
      new Request("https://example.test/api/repos/test-user/private-curry"),
      "test-user",
      "private-curry",
      env,
      {
        recipeRepositories: {
          ...createRecipeRepository([]),
          async findByOwnerAndSlug() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when private repository owner profile lookup fails", async () => {
    const response = await handleGetRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: {
          ...createUserProfileRepository([]),
          async findByAuthSubject() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load profile.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("hides private repositories when the session has no bootstrapped profile", async () => {
    const response = await handleGetRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns public repository dependencies without requiring login", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies"),
      "test-user",
      "public-curry",
      env,
      {
        recipeComponents: createRecipeComponentRepository([
          { ...recipeComponent, recipeId: "repo_public" },
        ]),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [
        {
          allergens: ["wheat"],
          alternatives: ["homemade roux"],
          dependencyType: "required",
          id: "component_roux",
          ingredientName: "curry-roux",
          quantity: 1,
          required: true,
          transitiveDependencies: [
            {
              allergens: ["milk"],
              dependencyType: "transitive",
              name: "milk powder",
              notes: "Often hidden in roux blocks.",
            },
          ],
          unit: "box",
        },
      ],
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("returns unlisted repository dependencies without requiring login", async () => {
    const unlistedRepository = {
      ...privateRepository,
      id: "repo_unlisted",
      slug: "unlisted-curry",
      visibility: "unlisted",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/unlisted-curry/dependencies"),
      "test-user",
      "unlisted-curry",
      env,
      {
        recipeComponents: createRecipeComponentRepository([
          { ...recipeComponent, recipeId: "repo_unlisted" },
        ]),
        recipeRepositories: createRecipeRepository([unlistedRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [expect.objectContaining({ id: "component_roux" })],
      repository: expect.objectContaining({
        id: "repo_unlisted",
        slug: "unlisted-curry",
        visibility: "unlisted",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("keeps private repository dependencies owner-only", async () => {
    const unauthenticated = await handleGetRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies"),
      "test-user",
      "private-curry",
      env,
      {
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );
    const ownerResponse = await handleGetRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: createUserProfileRepository([owner]),
      },
    );

    await expect(parseJson(unauthenticated)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(unauthenticated.status).toBe(404);
    await expect(parseJson(ownerResponse)).resolves.toEqual({
      components: [expect.objectContaining({ id: "component_roux" })],
      repository: expect.objectContaining({ id: "repo_private" }),
    });
    expect(ownerResponse.status).toBe(200);
  });

  it("returns a JSON error when dependency loading fails", async () => {
    const response = await handleGetRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        recipeComponents: {
          async listByRepositoryId() {
            throw new Error("D1 unavailable");
          },
          async replaceByRepositoryId() {
            return [];
          },
        },
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: createUserProfileRepository([owner]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load dependencies.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("generates SeasoningBOM JSON for readable repositories without inventory audit details", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositoryBom(
      new Request("https://example.test/api/repos/test-user/public-curry/bom"),
      "test-user",
      "public-curry",
      env,
      {
        recipeComponents: createRecipeComponentRepository([
          { ...recipeComponent, recipeId: "repo_public" },
        ]),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      audit: {
        issues: [
          expect.objectContaining({
            category: "allergen",
            componentName: "curry-roux",
          }),
          expect.objectContaining({
            category: "transitive-dependency",
            componentName: "curry-roux",
          }),
        ],
      },
      bomFormat: "SeasoningBOM",
      components: [
        expect.objectContaining({
          dependencies: [
            {
              allergens: ["milk"],
              dependencyType: "transitive",
              name: "milk powder",
              notes: "Often hidden in roux blocks.",
            },
          ],
          name: "curry-roux",
        }),
      ],
      generatedAt: expect.any(String),
      repository: expect.objectContaining({
        owner: "test-user",
        visibility: "public",
      }),
      specVersion: "0.1.0",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="public-curry-seasoningbom.json"',
    );
  });

  it("returns public security alerts without private inventory audit issues", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositorySecurity(
      new Request("https://example.test/api/repos/test-user/public-curry/security"),
      "test-user",
      "public-curry",
      env,
      {
        recipeComponents: createRecipeComponentRepository([
          { ...recipeComponent, recipeId: "repo_public" },
        ]),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      generatedAt: expect.any(String),
      recipeAlerts: [
        expect.objectContaining({
          category: "allergen",
          componentName: "curry-roux",
        }),
        expect.objectContaining({
          category: "transitive-dependency",
          componentName: "curry-roux",
        }),
      ],
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
      summary: {
        critical: 0,
        high: 0,
        low: 0,
        medium: 2,
        totalIssues: 2,
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns a JSON error when SeasoningBOM component loading fails", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositoryBom(
      new Request("https://example.test/api/repos/test-user/public-curry/bom"),
      "test-user",
      "public-curry",
      env,
      {
        recipeComponents: {
          async listByRepositoryId() {
            throw new Error("D1 unavailable");
          },
          async replaceByRepositoryId() {
            return [];
          },
        },
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to generate SeasoningBOM.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when security alert loading fails", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleGetRepositorySecurity(
      new Request("https://example.test/api/repos/test-user/public-curry/security"),
      "test-user",
      "public-curry",
      env,
      {
        recipeComponents: {
          async listByRepositoryId() {
            throw new Error("D1 unavailable");
          },
          async replaceByRepositoryId() {
            return [];
          },
        },
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load security alerts.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("runs inventory audit against the authenticated user's private inventory", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const riceComponent = {
      ...recipeComponent,
      allergens: [],
      ingredientName: "Rice",
      quantity: 3,
      recipeId: "repo_public",
      transitiveDependencies: [],
      unit: "go",
    } satisfies Awaited<ReturnType<RecipeComponentWriteRepository["listByRepositoryId"]>>[number];
    const response = await handlePostRepositoryAudit("test-user", "public-curry", owner, env, {
      inventoryItems: createInventoryRepository([
        inventoryItem,
        {
          ...inventoryItem,
          id: "inventory_other",
          quantity: 99,
          userId: "profile_other",
        },
      ]),
      now: () => new Date("2026-07-06T02:03:04.000Z"),
      recipeComponents: createRecipeComponentRepository([riceComponent]),
      recipeRepositories: createRecipeRepository([publicRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      inventoryAudit: {
        generatedAt: "2026-07-06T02:03:04.000Z",
        issues: [
          expect.objectContaining({
            category: "quantity",
            componentName: "Rice",
            message: "Rice@3go is insufficient",
          }),
        ],
        recipeId: "repo_public",
        summary: {
          critical: 0,
          high: 1,
          low: 0,
          medium: 0,
          totalIssues: 1,
        },
      },
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("runs inventory audit for the private repository owner", async () => {
    const response = await handlePostRepositoryAudit("test-user", "private-curry", owner, env, {
      inventoryItems: createInventoryRepository([inventoryItem]),
      recipeComponents: createRecipeComponentRepository([recipeComponent]),
      recipeRepositories: createRecipeRepository([privateRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      inventoryAudit: expect.objectContaining({
        recipeId: "repo_private",
      }),
      repository: expect.objectContaining({
        id: "repo_private",
        visibility: "private",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("does not run inventory audit for non-readable private repositories", async () => {
    const response = await handlePostRepositoryAudit(
      "test-user",
      "private-curry",
      { ...owner, id: "profile_other" },
      env,
      {
        inventoryItems: createInventoryRepository([inventoryItem]),
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns a JSON error when inventory audit loading fails", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryAudit("test-user", "public-curry", owner, env, {
      inventoryItems: {
        async create(input) {
          return {
            ...inventoryItem,
            category: input.category,
            createdAt: input.now,
            id: input.id,
            name: input.name,
            quantity: input.quantity,
            unit: input.unit,
            updatedAt: input.now,
            userId: input.userId,
          };
        },
        async deleteForUser() {},
        async findByIdForUser() {
          return null;
        },
        async listByUserIdAndIds() {
          throw new Error("D1 unavailable");
        },
        async listByUserId() {
          throw new Error("D1 unavailable");
        },
        async update() {
          return null;
        },
      },
      recipeComponents: createRecipeComponentRepository([recipeComponent]),
      recipeRepositories: createRecipeRepository([publicRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to run inventory audit.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("replaces repository dependencies for the authenticated owner", async () => {
    const recipeComponents = createRecipeComponentRepository([recipeComponent]);
    const response = await handlePutRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        body: JSON.stringify({
          components: [
            {
              allergens: ["wheat", "wheat"],
              alternatives: ["homemade roux"],
              dependencyType: "required",
              id: "component_spice",
              ingredientName: "spice mix",
              quantity: 2,
              required: false,
              transitiveDependencies: [
                {
                  allergens: ["soy"],
                  dependencyType: "transitive",
                  name: "soy lecithin",
                  notes: "Check the packet.",
                },
              ],
              unit: "pack",
            },
          ],
        }),
        method: "PUT",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeComponents,
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [
        {
          allergens: ["wheat"],
          alternatives: ["homemade roux"],
          dependencyType: "required",
          id: "component_spice",
          ingredientName: "spice mix",
          quantity: 2,
          required: false,
          transitiveDependencies: [
            {
              allergens: ["soy"],
              dependencyType: "transitive",
              name: "soy lecithin",
              notes: "Check the packet.",
            },
          ],
          unit: "pack",
        },
      ],
      repository: expect.objectContaining({
        id: "repo_private",
        slug: "private-curry",
      }),
    });
    expect(response.status).toBe(200);
    await expect(recipeComponents.listByRepositoryId("repo_private")).resolves.toEqual([
      expect.objectContaining({
        id: "component_spice",
        recipeId: "repo_private",
      }),
    ]);
  });

  it("generates missing component ids when replacing dependencies", async () => {
    const response = await handlePutRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        body: JSON.stringify({
          components: [
            {
              dependencyType: "required",
              ingredientName: "rice",
              quantity: 2,
              unit: "go",
            },
          ],
        }),
        method: "PUT",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        createRecipeComponentId: () => "component_generated",
        recipeComponents: createRecipeComponentRepository([]),
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [
        expect.objectContaining({
          id: "component_generated",
          ingredientName: "rice",
          required: true,
          transitiveDependencies: [],
        }),
      ],
      repository: expect.objectContaining({ id: "repo_private" }),
    });
    expect(response.status).toBe(200);
  });

  it("keeps dependency replacement owner-only", async () => {
    const response = await handlePutRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        body: JSON.stringify({ components: [] }),
        method: "PUT",
      }),
      "test-user",
      "private-curry",
      { ...owner, id: "profile_other" },
      env,
      {
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it.each([
    {
      body: null,
      message: "Request body must be a JSON object.",
    },
    {
      body: {},
      message: "Components must be an array.",
    },
    {
      body: { components: Array.from({ length: 201 }, () => createDependencyComponentBody()) },
      message: "Components must contain 38 items or fewer.",
    },
    {
      body: { components: [null] },
      message: "Component 1: Component must be a JSON object.",
    },
    {
      body: { components: [createDependencyComponentBody({ id: " " })] },
      message: "Component 1: Id must be a non-empty string up to 120 characters.",
    },
    {
      body: { components: [createDependencyComponentBody({ ingredientName: "" })] },
      message: "Component 1: Ingredient name must be 1-120 characters.",
    },
    {
      body: { components: [createDependencyComponentBody({ quantity: -1 })] },
      message: "Component 1: Quantity must be a finite number greater than or equal to 0.",
    },
    {
      body: { components: [createDependencyComponentBody({ unit: "jar" })] },
      message: "Component 1: Unit must be a known recipe unit.",
    },
    {
      body: { components: [{ ingredientName: "rice", quantity: 1, unit: "go" }] },
      message: "Component 1: Dependency type must be a known recipe dependency type.",
    },
    {
      body: { components: [createDependencyComponentBody({ required: "yes" })] },
      message: "Component 1: Required must be a boolean.",
    },
    {
      body: {
        components: [
          {
            allergens: ["unknown"],
            dependencyType: "required",
            ingredientName: "rice",
            quantity: 1,
            unit: "go",
          },
        ],
      },
      message: "Component 1: Allergens must be known allergen strings.",
    },
    {
      body: { components: [createDependencyComponentBody({ alternatives: [""] })] },
      message: "Component 1: Alternatives must be strings up to 120 characters.",
    },
    {
      body: { components: [createDependencyComponentBody({ transitiveDependencies: "soy" })] },
      message: "Component 1: Transitive dependencies must be an array.",
    },
    {
      body: {
        components: [
          createDependencyComponentBody({
            transitiveDependencies: Array.from({ length: 38 }, (_, index) => ({
              dependencyType: "transitive",
              name: `dependency-${index}`,
            })),
          }),
        ],
      },
      message: "Components and transitive dependencies must contain 38 total rows or fewer.",
    },
    {
      body: { components: [createDependencyComponentBody({ transitiveDependencies: [null] })] },
      message: "Component 1: Dependency 1: Dependency must be a JSON object.",
    },
    {
      body: {
        components: [
          {
            dependencyType: "required",
            ingredientName: "rice",
            quantity: 1,
            transitiveDependencies: [{ dependencyType: "transitive", name: "" }],
            unit: "go",
          },
        ],
      },
      message: "Component 1: Dependency 1: Name must be 1-120 characters.",
    },
    {
      body: {
        components: [
          createDependencyComponentBody({
            transitiveDependencies: [{ dependencyType: "dev", name: "soy" }],
          }),
        ],
      },
      message:
        "Component 1: Dependency 1: Dependency type must be transitive, substitute, or peer.",
    },
    {
      body: {
        components: [
          createDependencyComponentBody({
            transitiveDependencies: [
              {
                allergens: ["unknown"],
                dependencyType: "transitive",
                name: "soy",
              },
            ],
          }),
        ],
      },
      message: "Component 1: Dependency 1: Allergens must be known allergen strings.",
    },
    {
      body: {
        components: [
          createDependencyComponentBody({
            transitiveDependencies: [
              {
                dependencyType: "transitive",
                name: "soy",
                notes: "n".repeat(1001),
              },
            ],
          }),
        ],
      },
      message: "Component 1: Dependency 1: Notes must be 1000 characters or fewer.",
    },
    {
      body: {
        components: [
          createDependencyComponentBody({ id: "component_duplicate" }),
          createDependencyComponentBody({ id: "component_duplicate" }),
        ],
      },
      message: "Component ids must be unique.",
    },
  ])("rejects invalid dependency replacement input %#", async ({ body, message }) => {
    const response = await handlePutRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        body: JSON.stringify(body),
        method: "PUT",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeComponents: createRecipeComponentRepository([]),
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message,
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns a JSON error when dependency replacement fails", async () => {
    const response = await handlePutRepositoryDependencies(
      new Request("https://example.test/api/repos/test-user/private-curry/dependencies", {
        body: JSON.stringify({ components: [] }),
        method: "PUT",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeComponents: {
          async listByRepositoryId() {
            return [];
          },
          async replaceByRepositoryId() {
            throw new Error("D1 unavailable");
          },
        },
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to update dependencies.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("stars and unstars readable repositories", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const repositoryStars = createRepositoryStarRepository();
    const starResponse = await handlePostRepositoryStar(
      new Request("https://example.test/api/repos/test-user/public-curry/star"),
      "test-user",
      "public-curry",
      owner,
      env,
      {
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeRepositories: createRecipeRepository([publicRepository]),
        repositoryStars,
      },
    );
    const unstarResponse = await handleDeleteRepositoryStar(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        method: "DELETE",
      }),
      "test-user",
      "public-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([publicRepository]),
        repositoryStars,
      },
    );

    await expect(parseJson(starResponse)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
      starred: true,
    });
    expect(starResponse.status).toBe(201);
    expect(repositoryStars.hasStar({ repositoryId: "repo_public", userId: owner.id })).toBe(false);
    expect(unstarResponse.status).toBe(204);
  });

  it("returns a JSON error when starring fails", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryStar(
      new Request("https://example.test/api/repos/test-user/public-curry/star"),
      "test-user",
      "public-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([publicRepository]),
        repositoryStars: {
          async isStarred() {
            return false;
          },
          async star() {
            throw new Error("D1 unavailable");
          },
          async unstar() {},
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to star repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when unstarring fails", async () => {
    const publicRepository = {
      ...privateRepository,
      id: "repo_public",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handleDeleteRepositoryStar(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        method: "DELETE",
      }),
      "test-user",
      "public-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([publicRepository]),
        repositoryStars: {
          async isStarred() {
            return true;
          },
          async star() {},
          async unstar() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to unstar repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("forks public repositories and records the source repository", async () => {
    const sourceRepository = {
      ...privateRepository,
      description: "A reliable curry recipe.",
      id: "repo_source",
      license: "Mother's Taste License",
      name: "Public Curry",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      readme: "# Public Curry",
      servings: 4,
      slug: "public-curry",
      version: "1.2.3",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const recipeRepositories = createRecipeRepository([sourceRepository]);
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      createContributionEventId: () => "contribution_fork",
      createRepositoryId: () => "repo_fork",
      now: () => new Date("2026-07-06T02:03:04.000Z"),
      recipeRepositories,
    });

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_fork",
        ownerHandle: "test-user",
        slug: "public-curry",
        sourceRepositoryId: "repo_source",
        visibility: "public",
      }),
    });
    expect(response.status).toBe(201);
    await expect(
      recipeRepositories.findByOwnerAndSlug("test-user", "public-curry"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "repo_fork",
        sourceRepositoryId: "repo_source",
      }),
    );
    expect(recipeRepositories.listContributionEvents()).toEqual([
      {
        contributionCount: 1,
        eventType: "repository_forked",
        id: "contribution_fork",
        metadata: {
          repositoryName: "Public Curry",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "public-curry",
          sourceRepositoryId: "repo_source",
          sourceRepositoryOwnerHandle: "source-user",
          sourceRepositorySlug: "public-curry",
          version: "1.2.3",
        },
        occurredAt: "2026-07-06T02:03:04.000Z",
        occurredOn: "2026-07-06",
        repositoryId: "repo_fork",
        userId: "profile_test",
        visibility: "summary_only",
      },
    ]);
  });

  it("forks unlisted repositories by exact URL", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "unlisted-curry",
      visibility: "unlisted",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryFork("source-user", "unlisted-curry", owner, env, {
      createRepositoryId: () => "repo_fork",
      recipeRepositories: createRecipeRepository([sourceRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_fork",
        sourceRepositoryId: "repo_source",
      }),
    });
    expect(response.status).toBe(201);
  });

  it("does not fork private repositories", async () => {
    const response = await handlePostRepositoryFork("test-user", "private-curry", owner, env, {
      recipeRepositories: createRecipeRepository([privateRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns not found when the fork source repository does not exist", async () => {
    const response = await handlePostRepositoryFork("source-user", "missing-curry", owner, env, {
      recipeRepositories: createRecipeRepository([]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns a JSON error when fork source lookup fails", async () => {
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([]),
        async findByOwnerAndSlug() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to fork repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when fork target lookup fails", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([sourceRepository]),
        async findByOwnerAndSlug(ownerHandle, slug) {
          if (ownerHandle === "source-user" && slug === "public-curry") {
            return sourceRepository;
          }
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to fork repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns conflict when a fork target slug already exists for the owner", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "private-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryFork("source-user", "private-curry", owner, env, {
      recipeRepositories: createRecipeRepository([sourceRepository, privateRepository]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "repository_already_exists",
        message: "A repository with this owner and slug already exists.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("returns conflict when a fork create race reserves the target slug", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const racedRepository = {
      ...sourceRepository,
      id: "repo_raced",
      ownerHandle: owner.username,
      ownerUserId: owner.id,
      sourceRepositoryId: sourceRepository.id,
    } satisfies CloudRecipeRepository;
    let targetLookups = 0;
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([sourceRepository]),
        async createWithContribution() {
          throw new Error("D1 constraint");
        },
        async findByOwnerAndSlug(ownerHandle, slug) {
          if (ownerHandle === "source-user" && slug === "public-curry") {
            return sourceRepository;
          }
          targetLookups += 1;
          return targetLookups === 1 ? null : racedRepository;
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "repository_already_exists",
        message: "A repository with this owner and slug already exists.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("returns a JSON error when fork create diagnostics fail", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    let targetLookups = 0;
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([sourceRepository]),
        async createWithContribution() {
          throw new Error("D1 unavailable");
        },
        async findByOwnerAndSlug(ownerHandle, slug) {
          if (ownerHandle === "source-user" && slug === "public-curry") {
            return sourceRepository;
          }
          targetLookups += 1;
          if (targetLookups === 1) {
            return null;
          }
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to fork repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when fork creation fails without a diagnostic match", async () => {
    const sourceRepository = {
      ...privateRepository,
      id: "repo_source",
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
      slug: "public-curry",
      visibility: "public",
    } satisfies CloudRecipeRepository;
    const response = await handlePostRepositoryFork("source-user", "public-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([sourceRepository]),
        async createWithContribution() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to fork repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("creates a repository with default metadata", async () => {
    const recipeRepositories = createRecipeRepository([]);
    const response = await handlePostRepository(
      new Request("https://example.test/api/repos", {
        body: JSON.stringify({
          name: "Curry Rice",
          slug: "curry-rice",
        }),
        method: "POST",
      }),
      owner,
      env,
      {
        createContributionEventId: () => "contribution_create",
        createRepositoryId: () => "repo_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        recipeRepositories,
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_new",
        servings: 2,
        version: "0.1.0",
        visibility: "public",
      }),
    });
    expect(response.status).toBe(201);
    expect(recipeRepositories.listContributionEvents()).toEqual([
      {
        contributionCount: 1,
        eventType: "recipe_created",
        id: "contribution_create",
        metadata: {
          repositoryName: "Curry Rice",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "curry-rice",
          version: "0.1.0",
        },
        occurredAt: "2026-07-06T01:02:03.000Z",
        occurredOn: "2026-07-06",
        repositoryId: "repo_new",
        userId: "profile_test",
        visibility: "summary_only",
      },
    ]);
  });

  it("keeps private repository creation contribution details private", async () => {
    const recipeRepositories = createRecipeRepository([]);
    const response = await handlePostRepository(
      new Request("https://example.test/api/repos", {
        body: JSON.stringify({
          name: "Secret Sauce",
          slug: "secret-sauce",
          visibility: "private",
        }),
        method: "POST",
      }),
      owner,
      env,
      {
        createContributionEventId: () => "contribution_private_create",
        createRepositoryId: () => "repo_private_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        recipeRepositories,
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_private_new",
        visibility: "private",
      }),
    });
    expect(response.status).toBe(201);
    expect(recipeRepositories.listContributionEvents()).toEqual([
      expect.objectContaining({
        eventType: "recipe_created",
        id: "contribution_private_create",
        repositoryId: "repo_private_new",
        visibility: "private",
      }),
    ]);
  });

  it("updates a repository and records a contribution event", async () => {
    const recipeRepositories = createRecipeRepository([privateRepository]);
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({
          name: "Renamed Curry",
          slug: "renamed-curry",
          version: "1.0.0",
        }),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        createContributionEventId: () => "contribution_update",
        now: () => new Date("2026-07-06T03:04:05.000Z"),
        recipeRepositories,
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_private",
        name: "Renamed Curry",
        slug: "renamed-curry",
        updatedAt: "2026-07-06T03:04:05.000Z",
        version: "1.0.0",
      }),
    });
    expect(response.status).toBe(200);
    expect(recipeRepositories.listContributionEvents()).toEqual([
      {
        contributionCount: 1,
        eventType: "recipe_updated",
        id: "contribution_update",
        metadata: {
          previousRepositorySlug: "private-curry",
          repositoryName: "Renamed Curry",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "renamed-curry",
          version: "1.0.0",
        },
        occurredAt: "2026-07-06T03:04:05.000Z",
        occurredOn: "2026-07-06",
        repositoryId: "repo_private",
        userId: "profile_test",
        visibility: "private",
      },
    ]);
  });

  it("does not record a contribution for visibility-only repository updates", async () => {
    const recipeRepositories = createRecipeRepository([privateRepository]);
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({ visibility: "public" }),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        createContributionEventId: () => "contribution_visibility",
        now: () => new Date("2026-07-06T03:04:05.000Z"),
        recipeRepositories,
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_private",
        updatedAt: "2026-07-06T03:04:05.000Z",
        visibility: "public",
      }),
    });
    expect(response.status).toBe(200);
    expect(recipeRepositories.listContributionEvents()).toEqual([]);
  });

  it.each([
    {
      body: null,
      message: "Request body must be a JSON object.",
    },
    {
      body: { slug: "curry-rice" },
      message: "Name must be a non-empty string up to 120 characters.",
    },
    {
      body: { name: "Curry Rice", slug: "Curry_Rice" },
      message: "Slug must be 1-80 lowercase letters, numbers, or hyphens.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", visibility: "friends" },
      message: "Visibility must be public, private, or unlisted.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", version: "v".repeat(33) },
      message: "Version must be 32 characters or fewer.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", servings: 0 },
      message: "Servings must be an integer between 1 and 999.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", description: "d".repeat(281) },
      message: "Description must be 280 characters or fewer.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", readme: "r".repeat(20_001) },
      message: "README must be 20000 characters or fewer.",
    },
    {
      body: { name: "Curry Rice", slug: "curry-rice", license: "l".repeat(121) },
      message: "License must be 120 characters or fewer.",
    },
  ])("rejects invalid repository create input %#", async ({ body, message }) => {
    const response = await handlePostRepository(
      new Request("https://example.test/api/repos", {
        body: JSON.stringify(body),
        method: "POST",
      }),
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message,
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns a JSON error when duplicate preflight lookup fails", async () => {
    const response = await handlePostRepository(createValidPostRequest(), owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([]),
        async findByOwnerAndSlug() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns conflict when a create race reserves the slug", async () => {
    let lookups = 0;
    const response = await handlePostRepository(
      createValidPostRequest({ slug: "private-curry" }),
      owner,
      env,
      {
        recipeRepositories: {
          ...createRecipeRepository([]),
          async createWithContribution() {
            throw new Error("D1 constraint");
          },
          async findByOwnerAndSlug() {
            lookups += 1;
            return lookups === 1 ? null : privateRepository;
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "repository_already_exists",
        message: "A repository with this owner and slug already exists.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("returns a JSON error when post-create diagnostics fail", async () => {
    let lookups = 0;
    const response = await handlePostRepository(createValidPostRequest(), owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([]),
        async createWithContribution() {
          throw new Error("D1 unavailable");
        },
        async findByOwnerAndSlug() {
          lookups += 1;
          if (lookups === 1) {
            return null;
          }
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when repository creation fails without a diagnostic match", async () => {
    const response = await handlePostRepository(createValidPostRequest(), owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([]),
        async createWithContribution() {
          throw new Error("D1 unavailable");
        },
        async findByOwnerAndSlug() {
          return null;
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("rejects empty repository updates", async () => {
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({}),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "At least one repository field must be provided.",
      },
    });
    expect(response.status).toBe(400);
  });

  it.each([
    null,
    "",
  ])("rejects explicit blank repository visibility updates %#", async (visibility) => {
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({ visibility }),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([privateRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Visibility must be public, private, or unlisted.",
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns conflict when repository update moves to an existing slug", async () => {
    const existingRepository: CloudRecipeRepository = {
      ...privateRepository,
      id: "repo_existing",
      slug: "existing-curry",
    };
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({ slug: "existing-curry" }),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeRepositories: createRecipeRepository([privateRepository, existingRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "repository_already_exists",
        message: "A repository with this owner and slug already exists.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("returns a JSON error when repository update fails", async () => {
    const response = await handlePatchRepository(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        body: JSON.stringify({ name: "Updated Curry" }),
        method: "PATCH",
      }),
      "test-user",
      "private-curry",
      owner,
      env,
      {
        recipeRepositories: {
          ...createRecipeRepository([privateRepository]),
          async updateWithContribution() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to update repository.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when repository delete fails", async () => {
    const response = await handleDeleteRepository("test-user", "private-curry", owner, env, {
      recipeRepositories: {
        ...createRecipeRepository([privateRepository]),
        async delete() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to delete repository.",
      },
    });
    expect(response.status).toBe(500);
  });
});

function createValidPostRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://example.test/api/repos", {
    body: JSON.stringify({
      name: "Curry Rice",
      slug: "curry-rice",
      ...overrides,
    }),
    method: "POST",
  });
}

function createDependencyComponentBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    dependencyType: "required",
    id: "component_rice",
    ingredientName: "rice",
    quantity: 1,
    unit: "go",
    ...overrides,
  };
}

function createRepositoryStarRepository(): RepositoryStarRepository & {
  hasStar(key: { repositoryId: string; userId: string }): boolean;
} {
  const stars = new Set<string>();

  return {
    hasStar(key) {
      return stars.has(repositoryStarKey(key));
    },
    async isStarred(key) {
      return stars.has(repositoryStarKey(key));
    },
    async star(input) {
      stars.add(repositoryStarKey(input));
    },
    async unstar(key) {
      stars.delete(repositoryStarKey(key));
    },
  };
}

function repositoryStarKey(key: { repositoryId: string; userId: string }): string {
  return `${key.userId}:${key.repositoryId}`;
}

function createRecipeRepository(
  initialRepositories: CloudRecipeRepository[],
): RecipeRepositoryMetadataRepository & {
  listContributionEvents(): CloudContributionEvent[];
} {
  const repositories = [...initialRepositories];
  const contributionEvents: CloudContributionEvent[] = [];

  function buildRepository(input: CreateRecipeRepositoryInput): CloudRecipeRepository {
    return {
      createdAt: input.now,
      description: input.description,
      id: input.id,
      license: input.license,
      maintainer: input.ownerHandle,
      name: input.name,
      ownerHandle: input.ownerHandle,
      ownerUserId: input.ownerUserId,
      readme: input.readme,
      servings: input.servings ?? 2,
      slug: input.slug,
      sourceRepositoryId: input.sourceRepositoryId,
      tags: [],
      updatedAt: input.now,
      version: input.version ?? "0.1.0",
      visibility: input.visibility ?? "public",
    };
  }

  return {
    async create(input: CreateRecipeRepositoryInput) {
      const repository = buildRepository(input);
      repositories.push(repository);
      return repository;
    },
    async createWithContribution(input) {
      const repository = buildRepository(input);
      repositories.push(repository);
      contributionEvents.push({
        contributionCount: 1,
        eventType: input.contribution.eventType,
        id: input.contribution.id,
        metadata: input.contribution.metadata,
        occurredAt: input.contribution.occurredAt,
        occurredOn: input.contribution.occurredOn,
        repositoryId: input.id,
        userId: input.ownerUserId,
        visibility: input.contribution.visibility,
      });
      return {
        contributionEvent: contributionEvents.at(-1) as CloudContributionEvent,
        repository,
      };
    },
    async delete(id) {
      const index = repositories.findIndex((repository) => repository.id === id);
      if (index >= 0) {
        repositories.splice(index, 1);
      }
    },
    async findByOwnerAndSlug(ownerHandle, slug) {
      return (
        repositories.find(
          (repository) => repository.ownerHandle === ownerHandle && repository.slug === slug,
        ) ?? null
      );
    },
    async listPublic() {
      return repositories.filter((repository) => repository.visibility === "public");
    },
    listContributionEvents() {
      return [...contributionEvents];
    },
    async update(input) {
      const repository: CloudRecipeRepository = {
        createdAt: input.createdAt,
        description: input.description,
        id: input.id,
        license: input.license,
        maintainer: input.ownerHandle,
        name: input.name,
        ownerHandle: input.ownerHandle,
        ownerUserId: input.ownerUserId,
        readme: input.readme,
        servings: input.servings,
        slug: input.slug,
        sourceRepositoryId: input.sourceRepositoryId,
        tags: [],
        updatedAt: input.now,
        version: input.version,
        visibility: input.visibility,
      };
      const index = repositories.findIndex((item) => item.id === input.id);
      if (index >= 0) {
        repositories[index] = repository;
      }
      return repository;
    },
    async updateWithContribution(input) {
      const repository: CloudRecipeRepository = {
        createdAt: input.createdAt,
        description: input.description,
        id: input.id,
        license: input.license,
        maintainer: input.ownerHandle,
        name: input.name,
        ownerHandle: input.ownerHandle,
        ownerUserId: input.ownerUserId,
        readme: input.readme,
        servings: input.servings,
        slug: input.slug,
        sourceRepositoryId: input.sourceRepositoryId,
        tags: [],
        updatedAt: input.now,
        version: input.version,
        visibility: input.visibility,
      };
      const index = repositories.findIndex((item) => item.id === input.id);
      if (index >= 0) {
        repositories[index] = repository;
      }
      contributionEvents.push({
        contributionCount: 1,
        eventType: input.contribution.eventType,
        id: input.contribution.id,
        metadata: input.contribution.metadata,
        occurredAt: input.contribution.occurredAt,
        occurredOn: input.contribution.occurredOn,
        repositoryId: input.id,
        userId: input.ownerUserId,
        visibility: input.contribution.visibility,
      });
      return {
        contributionEvent: contributionEvents.at(-1) as CloudContributionEvent,
        repository,
      };
    },
  };
}

function createRecipeComponentRepository(
  initialComponents: Awaited<ReturnType<RecipeComponentWriteRepository["listByRepositoryId"]>>,
): RecipeComponentWriteRepository {
  const components = [...initialComponents];

  return {
    async listByRepositoryId(repositoryId) {
      return components.filter((component) => component.recipeId === repositoryId);
    },
    async replaceByRepositoryId(repositoryId, nextComponents) {
      for (let index = components.length - 1; index >= 0; index -= 1) {
        if (components[index]?.recipeId === repositoryId) {
          components.splice(index, 1);
        }
      }

      const savedComponents = nextComponents.map((component) => ({
        ...component,
        recipeId: repositoryId,
      }));
      components.push(...savedComponents);
      return savedComponents;
    },
  };
}

function createInventoryRepository(initialItems: CloudInventoryItem[]): InventoryItemRepository {
  const items = [...initialItems];

  return {
    async create(input: CreateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.now,
        hazardous: input.hazardous ?? false,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      items.push(item);
      return item;
    },
    async deleteForUser(userId, id) {
      const index = items.findIndex((item) => item.userId === userId && item.id === id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    },
    async findByIdForUser(userId, id) {
      return items.find((item) => item.userId === userId && item.id === id) ?? null;
    },
    async listByUserIdAndIds(userId, ids) {
      const idSet = new Set(ids);
      return items.filter((item) => item.userId === userId && idSet.has(item.id));
    },
    async listByUserId(userId) {
      return items.filter((item) => item.userId === userId);
    },
    async update(input: UpdateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.createdAt,
        hazardous: input.hazardous,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      const index = items.findIndex(
        (storedItem) => storedItem.id === input.id && storedItem.userId === input.userId,
      );
      if (index < 0) {
        return null;
      }
      items[index] = item;
      return item;
    },
  };
}

function createUserProfileRepository(initialProfiles: UserProfile[]): UserProfileRepository {
  const profiles = [...initialProfiles];

  return {
    async create(input) {
      const profile: UserProfile = {
        authProvider: input.authProvider,
        authSubject: input.authSubject,
        avatarUrl: input.avatarUrl,
        contributionVisibility: input.contributionVisibility ?? "summary_only",
        createdAt: input.now,
        displayName: input.displayName,
        id: input.id,
        updatedAt: input.now,
        username: input.username,
      };
      profiles.push(profile);
      return profile;
    },
    async findByAuthSubject(authProvider, authSubject) {
      return (
        profiles.find(
          (profile) => profile.authProvider === authProvider && profile.authSubject === authSubject,
        ) ?? null
      );
    },
    async findByUsername(username) {
      return profiles.find((profile) => profile.username === username) ?? null;
    },
  };
}
