import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudApiProvider } from "../../app/providers/CloudApiProvider";
import type { SeasoningBOM } from "../../domain";
import {
  CloudApiError,
  type CloudRecipeComponent,
  type CloudRepository,
  type CloudRepositorySecurity,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { RecipeDetailPage } from "./RecipeDetailPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const downloadJsonMock = vi.hoisted(() => vi.fn());
const cloudProfileMock = vi.hoisted(() => ({
  current: { profile: null, status: "disabled" } as unknown,
}));

vi.mock("../download", () => ({
  downloadJson: downloadJsonMock,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

vi.mock("../../app/providers/CloudProfileProvider", () => ({
  useCloudProfile: () => cloudProfileMock.current,
}));

describe("RecipeDetailPage", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/me/curry-rice");
    downloadJsonMock.mockReset();
  });

  it("renders code, dependency, and security views for a repository", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({
      readme: "# Curry Rice\n\n## Build\n\n1. Cook rice\nServe.",
      tags: ["japanese", "quick"],
    });
    const components = [
      makeComponent({
        allergens: ["wheat"],
        alternatives: ["brown rice"],
        ingredientName: "rice",
        transitiveDependencies: [{ allergens: ["soy"], dependencyType: "transitive", name: "soy" }],
      }),
    ];
    liveDataMock.current = {
      components,
      inventoryItems: [makeInventoryItem({ bestBeforeDate: "2026-07-01", name: "rice" })],
      recipes: [recipe],
      repositories: {
        recipes: {
          delete: vi.fn(),
        },
      },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage ownerHandle="me" slug="curry-rice" />);

    expect(screen.getByRole("heading", { name: "Curry Rice" })).toBeInTheDocument();
    expect(screen.getByText("nom audit found 3 issues.")).toBeInTheDocument();
    expect(screen.getByText("All required dependencies are installed.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(screen.getByText("Allergens: wheat")).toBeInTheDocument();
    expect(screen.getByText(/soy/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByRole("heading", { name: "Security alerts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recipe alerts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your inventory audit" })).toBeInTheDocument();
    expect(screen.getByText("rice has reached EOL")).toBeInTheDocument();
  });

  it("downloads a SeasoningBOM and deletes a repository", async () => {
    const user = userEvent.setup();
    const deleteRecipe = vi.fn().mockResolvedValue(undefined);
    liveDataMock.current = {
      components: [makeComponent()],
      inventoryItems: [makeInventoryItem()],
      recipes: [makeRecipe()],
      repositories: {
        recipes: {
          delete: deleteRecipe,
        },
      },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage ownerHandle="me" slug="curry-rice" />);

    await user.click(screen.getByRole("button", { name: "Download SBOM" }));
    expect(downloadJsonMock).toHaveBeenCalledWith(
      "curry-rice-seasoningbom.json",
      expect.objectContaining({
        bomFormat: "SeasoningBOM",
        repository: expect.objectContaining({ owner: "me", name: "curry-rice" }),
      }),
    );
    expect(downloadJsonMock.mock.calls[0]?.[1].components[0]).not.toHaveProperty("lifecycle");
    expect(screen.getByText("SeasoningBOM JSON downloaded.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteRecipe).toHaveBeenCalledWith("recipe-curry"));
    expect(window.location.pathname).toBe("/");
  });

  it("renders empty repository detail states", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [makeRecipe({ readme: undefined })],
      repositories: { recipes: { delete: vi.fn() } },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage ownerHandle="me" slug="missing" />);
    expect(screen.getByText("Repository not found")).toBeInTheDocument();
  });

  it("shows empty recipe alert and inventory audit sections", async () => {
    const user = userEvent.setup();
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [makeRecipe({ license: undefined, readme: undefined })],
      repositories: { recipes: { delete: vi.fn() } },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage ownerHandle="me" slug="curry-rice" />);

    await user.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByText("No active audit issues")).toBeInTheDocument();
    expect(screen.getByText("No public recipe alerts")).toBeInTheDocument();
    expect(screen.getByText("No private inventory audit issues")).toBeInTheDocument();
  });
});

describe("RecipeDetailPage cloud repository", () => {
  const repository: CloudRepository = {
    createdAt: "2026-07-23T00:00:00.000Z",
    description: "A cloud-hosted curry",
    id: "repo_cloud",
    name: "Cloud Curry",
    ownerHandle: "test-cook",
    readme: "# Cloud Curry\n\n## Build\n\n1. Simmer carefully.",
    servings: 4,
    slug: "cloud-curry",
    tags: ["curry", "public"],
    updatedAt: "2026-07-23T00:00:00.000Z",
    version: "1.0.0",
    visibility: "public",
  };
  const components: CloudRecipeComponent[] = [
    {
      allergens: ["wheat"],
      alternatives: ["brown rice"],
      dependencyType: "required",
      id: "component_rice",
      ingredientName: "rice",
      quantity: 2,
      required: true,
      transitiveDependencies: [
        {
          allergens: ["soy"],
          dependencyType: "transitive",
          id: "dependency_soy",
          name: "soy sauce",
        },
      ],
      unit: "go",
    },
  ];
  const security: CloudRepositorySecurity = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    recipeAlerts: [
      {
        category: "allergen",
        componentName: "rice",
        id: "alert_wheat",
        message: "rice declares wheat",
        recommendation: "Check the label before cooking.",
        severity: "high",
      },
    ],
    repository,
    summary: { critical: 0, high: 1, low: 0, medium: 0, totalIssues: 1 },
  };
  const bom: SeasoningBOM = {
    audit: { issues: security.recipeAlerts },
    bomFormat: "SeasoningBOM",
    components: [],
    generatedAt: "2026-07-23T00:00:00.000Z",
    repository: {
      name: repository.slug,
      owner: repository.ownerHandle,
      version: repository.version,
      visibility: repository.visibility,
    },
    specVersion: "0.1.0",
  };

  beforeEach(() => {
    window.history.pushState({}, "", "/test-cook/cloud-curry");
    downloadJsonMock.mockReset();
    cloudProfileMock.current = { profile: null, status: "disabled" };
  });

  it("renders API-backed code, dependencies, public alerts, and BOM download", async () => {
    const user = userEvent.setup();
    const client = createCloudClient();
    renderCloudDetail(client);

    expect(screen.getByText("Loading repository")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cloud Curry" })).toBeInTheDocument();
    expect(screen.getByText("rice@2go")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(screen.getByText("Allergens: wheat")).toBeInTheDocument();
    expect(screen.getByText("Alternatives: brown rice")).toBeInTheDocument();
    expect(screen.getByText(/soy sauce/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByText("Public Recipe Alerts: 1.")).toBeInTheDocument();
    expect(screen.getByText("rice declares wheat")).toBeInTheDocument();
    expect(screen.queryByText("Your inventory audit")).not.toBeInTheDocument();
    expect(client.runRepositoryAudit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Download SBOM" }));
    await waitFor(() =>
      expect(downloadJsonMock).toHaveBeenCalledWith("cloud-curry-seasoningbom.json", bom),
    );
    expect(screen.getByText("SeasoningBOM JSON downloaded.")).toBeInTheDocument();
  });

  it("shows the signed-in viewer only their private inventory audit", async () => {
    const user = userEvent.setup();
    const runRepositoryAudit = vi.fn().mockResolvedValue({
      inventoryAudit: {
        generatedAt: "2026-07-23T00:00:00.000Z",
        issues: [
          {
            category: "unsupported",
            componentName: "rice",
            id: "inventory_alert_rice",
            inventoryItemId: "inventory_rice",
            message: "rice is unsupported and excluded from recommendations",
            recommendation: "Replace it with a supported ingredient.",
            severity: "critical",
          },
        ],
        recipeId: repository.id,
        summary: { critical: 1, high: 0, low: 0, medium: 0, totalIssues: 1 },
      },
      repository,
    });
    cloudProfileMock.current = {
      profile: { username: "signed-in-viewer" },
      status: "ready",
    };
    renderCloudDetail(createCloudClient({ runRepositoryAudit }));

    expect(await screen.findByRole("heading", { name: "Cloud Curry" })).toBeInTheDocument();
    expect(runRepositoryAudit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Security" }));

    expect(
      await screen.findByRole("heading", { name: "Your inventory audit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("rice is unsupported and excluded from recommendations"),
    ).toBeInTheDocument();
    expect(runRepositoryAudit).toHaveBeenCalledWith(
      "test-cook",
      "cloud-curry",
      expect.any(AbortSignal),
    );
  });

  it("keeps the private audit visible when public alerts are unavailable", async () => {
    const user = userEvent.setup();
    const runRepositoryAudit = vi.fn().mockResolvedValue({
      inventoryAudit: {
        generatedAt: "2026-07-23T00:00:00.000Z",
        issues: [],
        recipeId: repository.id,
        summary: { critical: 0, high: 0, low: 0, medium: 0, totalIssues: 0 },
      },
      repository,
    });
    cloudProfileMock.current = {
      profile: { username: "signed-in-viewer" },
      status: "ready",
    };
    renderCloudDetail(
      createCloudClient({
        getRepositorySecurity: vi.fn().mockRejectedValue(new Error("offline")),
        runRepositoryAudit,
      }),
    );

    expect(await screen.findByRole("heading", { name: "Cloud Curry" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByText("Security alerts unavailable")).toBeInTheDocument();
    expect(await screen.findByText("No private inventory audit issues")).toBeInTheDocument();
  });

  it("shows edit and delete actions only to the cloud repository owner", async () => {
    const user = userEvent.setup();
    const deleteRepository = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    cloudProfileMock.current = {
      profile: { username: repository.ownerHandle },
      status: "ready",
    };
    renderCloudDetail(createCloudClient({ deleteRepository }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirm).toHaveBeenCalledWith("Delete test-cook/cloud-curry?");
    expect(deleteRepository).toHaveBeenCalledWith("test-cook", "cloud-curry");
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("stars, unstars, and forks a cloud repository for a signed-in viewer", async () => {
    const user = userEvent.setup();
    const getRepositoryStar = vi.fn().mockResolvedValue({ repository, starred: false });
    const starRepository = vi.fn().mockResolvedValue({ repository, starred: true });
    const unstarRepository = vi.fn().mockResolvedValue(undefined);
    const forkRepository = vi.fn().mockResolvedValue({
      ...repository,
      id: "repo_fork",
      ownerHandle: "signed-in-viewer",
      sourceRepositoryId: repository.id,
    });
    cloudProfileMock.current = {
      profile: { username: "signed-in-viewer" },
      status: "ready",
    };
    renderCloudDetail(
      createCloudClient({
        forkRepository,
        getRepositoryStar,
        starRepository,
        unstarRepository,
      }),
    );

    const starButton = await screen.findByRole("button", { name: "Star" });
    expect(screen.getByRole("button", { name: "Fork" })).toBeInTheDocument();
    expect(getRepositoryStar).toHaveBeenCalledWith(
      "test-cook",
      "cloud-curry",
      expect.any(AbortSignal),
    );

    await user.click(starButton);
    expect(await screen.findByRole("button", { name: "Unstar" })).toBeInTheDocument();
    expect(starRepository).toHaveBeenCalledWith("test-cook", "cloud-curry");

    await user.click(screen.getByRole("button", { name: "Unstar" }));
    expect(await screen.findByText("Star removed.")).toHaveAttribute("role", "status");
    expect(unstarRepository).toHaveBeenCalledWith("test-cook", "cloud-curry");

    await user.click(screen.getByRole("button", { name: "Fork" }));
    await waitFor(() => expect(window.location.pathname).toBe("/signed-in-viewer/cloud-curry"));
    expect(forkRepository).toHaveBeenCalledWith("test-cook", "cloud-curry");
  });

  it("keeps repository metadata visible when optional resources fail", async () => {
    const user = userEvent.setup();
    renderCloudDetail(
      createCloudClient({
        getRepository: vi.fn().mockResolvedValue({
          ...repository,
          description: undefined,
          readme: undefined,
          sourceRepositoryId: "repo_source",
        }),
        getRepositoryBom: vi.fn().mockRejectedValue(new Error("offline")),
        getRepositoryDependencies: vi.fn().mockRejectedValue(new Error("offline")),
        getRepositorySecurity: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    );

    expect(await screen.findByText("No description provided.")).toBeInTheDocument();
    expect(screen.getByText("Forked from repository repo_source.")).toBeInTheDocument();
    expect(screen.getByText("No README committed yet.")).toBeInTheDocument();
    expect(screen.getByText("Dependencies could not be loaded.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(
      screen.getByText("The dependency graph could not be loaded. Please try again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByText("Security alerts unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download SBOM" }));
    expect(await screen.findByText("SeasoningBOM download failed. Please try again.")).toHaveClass(
      "flash-danger",
    );
  });

  it("renders empty public dependency and alert states", async () => {
    const user = userEvent.setup();
    renderCloudDetail(
      createCloudClient({
        getRepositoryDependencies: vi.fn().mockResolvedValue({ components: [], repository }),
        getRepositorySecurity: vi.fn().mockResolvedValue({
          ...security,
          recipeAlerts: [],
          summary: { critical: 0, high: 0, low: 0, medium: 0, totalIssues: 0 },
        }),
      }),
    );

    expect(await screen.findByText("No dependencies declared.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(screen.getByText("No dependencies")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByText("No public recipe alerts")).toBeInTheDocument();
  });

  it.each([
    [new CloudApiError(404, "Repository not found."), "Repository not found"],
    [new Error("offline"), "Repository unavailable"],
  ])("renders repository load failures", async (error, expected) => {
    renderCloudDetail(createCloudClient({ getRepository: vi.fn().mockRejectedValue(error) }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("aborts all repository requests when the route unmounts", async () => {
    const signals: AbortSignal[] = [];
    const pending = (_owner: string, _slug: string, signal?: AbortSignal) => {
      if (signal) {
        signals.push(signal);
      }
      return new Promise<never>(() => undefined);
    };
    const { unmount } = renderCloudDetail(
      createCloudClient({
        getRepository: vi.fn(pending),
        getRepositoryDependencies: vi.fn(pending),
        getRepositorySecurity: vi.fn(pending),
      }),
    );

    await waitFor(() => expect(signals).toHaveLength(3));
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  function renderCloudDetail(client: SeasoningBomApiClient) {
    return render(
      <CloudApiProvider client={client}>
        <RecipeDetailPage ownerHandle="test-cook" slug="cloud-curry" />
      </CloudApiProvider>,
    );
  }

  function createCloudClient(
    overrides: Partial<SeasoningBomApiClient> = {},
  ): SeasoningBomApiClient {
    return createCloudApiClientMock({
      getRepository: vi.fn().mockResolvedValue(repository),
      getRepositoryBom: vi.fn().mockResolvedValue(bom),
      getRepositoryDependencies: vi.fn().mockResolvedValue({ components, repository }),
      getRepositorySecurity: vi.fn().mockResolvedValue(security),
      ...overrides,
    });
  }
});
