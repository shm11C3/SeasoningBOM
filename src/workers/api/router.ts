import { Hono } from "hono";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import {
  authenticateClerkRequest,
  type ClerkAuthenticationOptions,
  type ClerkSession,
} from "../auth/clerk";
import {
  type CookingLogRouteOptions,
  handleGetCookingLogs,
  handlePostCookingLog,
} from "./cookingLogs";
import {
  handleDeleteInventory,
  handleListInventory,
  handlePatchInventory,
  handlePostInventory,
  type InventoryRouteOptions,
} from "./inventory";
import {
  handleGetMe,
  handleGetPublicProfile,
  handleGetUserContributionDay,
  handleGetUserContributions,
  handlePostMeProfile,
  type ProfileRouteOptions,
  requireBootstrappedProfile,
} from "./profile";
import {
  handleDeleteRepository,
  handleDeleteRepositoryComponent,
  handleDeleteRepositoryDependency,
  handleDeleteRepositoryStar,
  handleGetRepository,
  handleGetRepositoryBom,
  handleGetRepositoryDependencies,
  handleGetRepositorySecurity,
  handleGetRepositoryStar,
  handleListRepositories,
  handlePatchRepository,
  handlePostRepository,
  handlePostRepositoryAudit,
  handlePostRepositoryComponent,
  handlePostRepositoryDependency,
  handlePostRepositoryFork,
  handlePostRepositoryStar,
  handlePutRepositoryComponent,
  handlePutRepositoryDependencies,
  handlePutRepositoryDependency,
  type RepositoryRouteOptions,
} from "./repositories";
import {
  authMisconfigured,
  jsonResponse,
  methodNotAllowed,
  notFound,
  unauthorized,
} from "./responses";
import type { WorkerEnv } from "./types";

export type WorkerApiOptions = ClerkAuthenticationOptions &
  ProfileRouteOptions &
  InventoryRouteOptions &
  RepositoryRouteOptions &
  CookingLogRouteOptions;

type WorkerApiHonoEnv = {
  Bindings: WorkerEnv;
};

type HeadMethodRoute = {
  allowedMethods: readonly string[];
  path: string;
};

const coreRoutes = {
  me: { allowedMethods: ["GET"], path: "/api/me" },
  meProfile: { allowedMethods: ["POST"], path: "/api/me/profile" },
  repositories: { allowedMethods: ["GET", "POST"], path: "/api/repos" },
  repositoryDetail: {
    allowedMethods: ["GET", "PATCH", "DELETE"],
    path: "/api/repos/:owner/:repo",
  },
  repositoryDependencies: {
    allowedMethods: ["GET", "PUT"],
    path: "/api/repos/:owner/:repo/dependencies",
  },
  repositoryDependencyComponents: {
    allowedMethods: ["POST"],
    path: "/api/repos/:owner/:repo/dependencies/components",
  },
  repositoryDependencyComponent: {
    allowedMethods: ["PUT", "DELETE"],
    path: "/api/repos/:owner/:repo/dependencies/components/:componentId",
  },
  repositoryComponentDependencies: {
    allowedMethods: ["POST"],
    path: "/api/repos/:owner/:repo/dependencies/components/:componentId/dependencies",
  },
  repositoryComponentDependency: {
    allowedMethods: ["PUT", "DELETE"],
    path: "/api/repos/:owner/:repo/dependencies/components/:componentId/dependencies/:dependencyId",
  },
  repositoryBom: {
    allowedMethods: ["GET"],
    path: "/api/repos/:owner/:repo/bom",
  },
  repositorySecurity: {
    allowedMethods: ["GET"],
    path: "/api/repos/:owner/:repo/security",
  },
  repositoryAudit: {
    allowedMethods: ["POST"],
    path: "/api/repos/:owner/:repo/audit",
  },
  repositoryCookingLogs: {
    allowedMethods: ["GET", "POST"],
    path: "/api/repos/:owner/:repo/cooking-logs",
  },
  repositoryStar: {
    allowedMethods: ["GET", "POST", "DELETE"],
    path: "/api/repos/:owner/:repo/star",
  },
  repositoryFork: {
    allowedMethods: ["POST"],
    path: "/api/repos/:owner/:repo/fork",
  },
  inventory: { allowedMethods: ["GET", "POST"], path: "/api/inventory" },
  inventoryItem: { allowedMethods: ["PATCH", "DELETE"], path: "/api/inventory/:id" },
  userProfile: { allowedMethods: ["GET"], path: "/api/users/:username/profile" },
  userContributions: { allowedMethods: ["GET"], path: "/api/users/:username/contributions" },
  userContributionDay: {
    allowedMethods: ["GET"],
    path: "/api/users/:username/contributions/:date",
  },
} as const satisfies Record<string, HeadMethodRoute>;

const headMethodRoutes: HeadMethodRoute[] = Object.values(coreRoutes);

export async function handleApiRequest(
  request: Request,
  env: WorkerEnv,
  options?: WorkerApiOptions,
): Promise<Response> {
  const app = options ? createWorkerApiApp(options) : defaultWorkerApiApp;
  return app.fetch(request, env);
}

export function createWorkerApiApp(options: WorkerApiOptions = {}): Hono<WorkerApiHonoEnv> {
  const app = new Hono<WorkerApiHonoEnv>({ strict: false });

  app.use("*", async (context, next) => {
    const allowedMethods = getHeadMethodAllowlist(context.req.raw);
    if (allowedMethods) {
      return methodNotAllowed(allowedMethods);
    }

    await next();
  });

  app.on(["GET", "HEAD"], "/api/health", (context) => handleHealth(context.req.raw));
  app.all("/api/health", () => methodNotAllowed(["GET", "HEAD"]));

  app.get(coreRoutes.me.path, async (context) => {
    const sessionResult = await requireClerkSession(context.req.raw, context.env, "GET", options);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return handleGetMe(sessionResult.session, context.env, options);
  });
  app.all(coreRoutes.me.path, () => methodNotAllowed(coreRoutes.me.allowedMethods));

  app.post(coreRoutes.meProfile.path, async (context) => {
    const sessionResult = await requireClerkSession(context.req.raw, context.env, "POST", options);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return handlePostMeProfile(context.req.raw, sessionResult.session, context.env, options);
  });
  app.all(coreRoutes.meProfile.path, () => methodNotAllowed(coreRoutes.meProfile.allowedMethods));

  app.get(coreRoutes.repositories.path, (context) => handleListRepositories(context.env, options));
  app.post(coreRoutes.repositories.path, async (context) => {
    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepository(context.req.raw, profileResult.profile, context.env, options);
  });
  app.all(coreRoutes.repositories.path, () =>
    methodNotAllowed(coreRoutes.repositories.allowedMethods),
  );

  app.get(coreRoutes.repositoryDetail.path, (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    return handleGetRepository(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      context.env,
      options,
    );
  });
  app.patch(coreRoutes.repositoryDetail.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "PATCH",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePatchRepository(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.delete(coreRoutes.repositoryDetail.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "DELETE",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleDeleteRepository(
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryDetail.path, () =>
    methodNotAllowed(coreRoutes.repositoryDetail.allowedMethods),
  );

  app.get(coreRoutes.repositoryDependencies.path, (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    return handleGetRepositoryDependencies(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      context.env,
      options,
    );
  });
  app.put(coreRoutes.repositoryDependencies.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "PUT",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePutRepositoryDependencies(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryDependencies.path, () =>
    methodNotAllowed(coreRoutes.repositoryDependencies.allowedMethods),
  );

  app.post(coreRoutes.repositoryDependencyComponents.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepositoryComponent(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryDependencyComponents.path, () =>
    methodNotAllowed(coreRoutes.repositoryDependencyComponents.allowedMethods),
  );

  app.put(coreRoutes.repositoryDependencyComponent.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    const componentId = getRequiredPathParam(context.req.param("componentId"), context.req.raw);
    if (!params.ok) {
      return params.response;
    }
    if (!componentId.ok) {
      return componentId.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "PUT",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePutRepositoryComponent(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      componentId.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.delete(coreRoutes.repositoryDependencyComponent.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    const componentId = getRequiredPathParam(context.req.param("componentId"), context.req.raw);
    if (!params.ok) {
      return params.response;
    }
    if (!componentId.ok) {
      return componentId.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "DELETE",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleDeleteRepositoryComponent(
      params.ownerHandle,
      params.slug,
      componentId.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryDependencyComponent.path, () =>
    methodNotAllowed(coreRoutes.repositoryDependencyComponent.allowedMethods),
  );

  app.post(coreRoutes.repositoryComponentDependencies.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    const componentId = getRequiredPathParam(context.req.param("componentId"), context.req.raw);
    if (!params.ok) {
      return params.response;
    }
    if (!componentId.ok) {
      return componentId.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepositoryDependency(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      componentId.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryComponentDependencies.path, () =>
    methodNotAllowed(coreRoutes.repositoryComponentDependencies.allowedMethods),
  );

  app.put(coreRoutes.repositoryComponentDependency.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    const componentId = getRequiredPathParam(context.req.param("componentId"), context.req.raw);
    const dependencyId = getRequiredPathParam(context.req.param("dependencyId"), context.req.raw);
    if (!params.ok) {
      return params.response;
    }
    if (!componentId.ok) {
      return componentId.response;
    }
    if (!dependencyId.ok) {
      return dependencyId.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "PUT",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePutRepositoryDependency(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      componentId.value,
      dependencyId.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.delete(coreRoutes.repositoryComponentDependency.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    const componentId = getRequiredPathParam(context.req.param("componentId"), context.req.raw);
    const dependencyId = getRequiredPathParam(context.req.param("dependencyId"), context.req.raw);
    if (!params.ok) {
      return params.response;
    }
    if (!componentId.ok) {
      return componentId.response;
    }
    if (!dependencyId.ok) {
      return dependencyId.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "DELETE",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleDeleteRepositoryDependency(
      params.ownerHandle,
      params.slug,
      componentId.value,
      dependencyId.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryComponentDependency.path, () =>
    methodNotAllowed(coreRoutes.repositoryComponentDependency.allowedMethods),
  );

  app.get(coreRoutes.repositoryBom.path, (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    return handleGetRepositoryBom(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryBom.path, () =>
    methodNotAllowed(coreRoutes.repositoryBom.allowedMethods),
  );

  app.get(coreRoutes.repositorySecurity.path, (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    return handleGetRepositorySecurity(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositorySecurity.path, () =>
    methodNotAllowed(coreRoutes.repositorySecurity.allowedMethods),
  );

  app.post(coreRoutes.repositoryAudit.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepositoryAudit(
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryAudit.path, () =>
    methodNotAllowed(coreRoutes.repositoryAudit.allowedMethods),
  );

  app.get(coreRoutes.repositoryCookingLogs.path, (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    return handleGetCookingLogs(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      context.env,
      options,
    );
  });
  app.post(coreRoutes.repositoryCookingLogs.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostCookingLog(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryCookingLogs.path, () =>
    methodNotAllowed(coreRoutes.repositoryCookingLogs.allowedMethods),
  );

  app.get(coreRoutes.repositoryStar.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "GET",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleGetRepositoryStar(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.post(coreRoutes.repositoryStar.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepositoryStar(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.delete(coreRoutes.repositoryStar.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "DELETE",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleDeleteRepositoryStar(
      context.req.raw,
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryStar.path, () =>
    methodNotAllowed(coreRoutes.repositoryStar.allowedMethods),
  );

  app.post(coreRoutes.repositoryFork.path, async (context) => {
    const params = getRepositoryParams(
      context.req.param("owner"),
      context.req.param("repo"),
      context.req.raw,
    );
    if (!params.ok) {
      return params.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostRepositoryFork(
      params.ownerHandle,
      params.slug,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.repositoryFork.path, () =>
    methodNotAllowed(coreRoutes.repositoryFork.allowedMethods),
  );

  app.get(coreRoutes.inventory.path, async (context) => {
    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "GET",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleListInventory(profileResult.profile, context.env, options);
  });
  app.post(coreRoutes.inventory.path, async (context) => {
    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "POST",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePostInventory(context.req.raw, profileResult.profile, context.env, options);
  });
  app.all(coreRoutes.inventory.path, () => methodNotAllowed(coreRoutes.inventory.allowedMethods));

  app.patch(coreRoutes.inventoryItem.path, async (context) => {
    const idResult = getRequiredPathParam(context.req.param("id"), context.req.raw);
    if (!idResult.ok) {
      return idResult.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "PATCH",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handlePatchInventory(
      context.req.raw,
      idResult.value,
      profileResult.profile,
      context.env,
      options,
    );
  });
  app.delete(coreRoutes.inventoryItem.path, async (context) => {
    const idResult = getRequiredPathParam(context.req.param("id"), context.req.raw);
    if (!idResult.ok) {
      return idResult.response;
    }

    const profileResult = await requireAuthenticatedProfile(
      context.req.raw,
      context.env,
      "DELETE",
      options,
    );
    if (!profileResult.ok) {
      return profileResult.response;
    }

    return handleDeleteInventory(idResult.value, profileResult.profile, context.env, options);
  });
  app.all(coreRoutes.inventoryItem.path, () =>
    methodNotAllowed(coreRoutes.inventoryItem.allowedMethods),
  );

  app.get(coreRoutes.userProfile.path, async (context) => {
    const usernameResult = getRequiredPathParam(context.req.param("username"), context.req.raw);
    if (!usernameResult.ok) {
      return usernameResult.response;
    }

    return handleGetPublicProfile(usernameResult.value, context.env, options);
  });
  app.all(coreRoutes.userProfile.path, () =>
    methodNotAllowed(coreRoutes.userProfile.allowedMethods),
  );

  app.get(coreRoutes.userContributions.path, async (context) => {
    const usernameResult = getRequiredPathParam(context.req.param("username"), context.req.raw);
    if (!usernameResult.ok) {
      return usernameResult.response;
    }

    const viewerResult = await resolveOptionalAuthenticatedProfile(
      context.req.raw,
      context.env,
      options,
    );
    if (!viewerResult.ok) {
      return viewerResult.response;
    }

    return handleGetUserContributions(
      context.req.raw,
      usernameResult.value,
      viewerResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.userContributions.path, () =>
    methodNotAllowed(coreRoutes.userContributions.allowedMethods),
  );

  app.get(coreRoutes.userContributionDay.path, async (context) => {
    const usernameResult = getRequiredPathParam(context.req.param("username"), context.req.raw);
    const dateResult = getRequiredPathParam(context.req.param("date"), context.req.raw);
    if (!usernameResult.ok) {
      return usernameResult.response;
    }
    if (!dateResult.ok) {
      return dateResult.response;
    }

    const viewerResult = await resolveOptionalAuthenticatedProfile(
      context.req.raw,
      context.env,
      options,
    );
    if (!viewerResult.ok) {
      return viewerResult.response;
    }

    return handleGetUserContributionDay(
      usernameResult.value,
      dateResult.value,
      viewerResult.profile,
      context.env,
      options,
    );
  });
  app.all(coreRoutes.userContributionDay.path, () =>
    methodNotAllowed(coreRoutes.userContributionDay.allowedMethods),
  );

  app.notFound((context) => notFound(pathnameFromRequest(context.req.raw)));

  return app;
}

const defaultWorkerApiApp = createWorkerApiApp();

function handleHealth(request: Request): Response {
  const allowedMethods = ["GET", "HEAD"];
  if (!allowedMethods.includes(request.method)) {
    return methodNotAllowed(allowedMethods);
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 204 });
  }

  return jsonResponse({
    ok: true,
    service: "SeasoningBOM",
    persistence: "d1",
  });
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  return normalized;
}

function pathnameFromRequest(request: Request): string {
  return normalizePathname(new URL(request.url).pathname);
}

function getHeadMethodAllowlist(request: Request): readonly string[] | null {
  if (request.method !== "HEAD") {
    return null;
  }

  const pathname = pathnameFromRequest(request);
  if (pathname === "/api/health") {
    return null;
  }

  const route = headMethodRoutes.find((candidate) => matchesRoutePattern(pathname, candidate.path));

  return route?.allowedMethods ?? null;
}

function matchesRoutePattern(pathname: string, routePath: string): boolean {
  const pathnameParts = pathname.split("/").filter(Boolean);
  const routeParts = routePath.split("/").filter(Boolean);
  if (pathnameParts.length !== routeParts.length) {
    return false;
  }

  return routeParts.every((routePart, index) => {
    return routePart.startsWith(":") || routePart === pathnameParts[index];
  });
}

function getRepositoryParams(
  ownerHandleParam: string | undefined,
  slugParam: string | undefined,
  request: Request,
): { ok: true; ownerHandle: string; slug: string } | { ok: false; response: Response } {
  const ownerHandle = decodePathSegment(ownerHandleParam);
  const slug = decodePathSegment(slugParam);
  if (!ownerHandle || !slug) {
    return { ok: false, response: notFound(pathnameFromRequest(request)) };
  }

  return { ok: true, ownerHandle, slug };
}

function getRequiredPathParam(
  value: string | undefined,
  request: Request,
): { ok: true; value: string } | { ok: false; response: Response } {
  const decodedValue = decodePathSegment(value);
  if (!decodedValue) {
    return { ok: false, response: notFound(pathnameFromRequest(request)) };
  }

  return { ok: true, value: decodedValue };
}

function decodePathSegment(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function requireClerkSession(
  request: Request,
  env: WorkerEnv,
  method: string,
  authOptions: ClerkAuthenticationOptions,
): Promise<{ ok: true; session: ClerkSession } | { ok: false; response: Response }> {
  const result = await authenticateClerkRequest(request, env, {
    ...authOptions,
    tokenSources: isMutationMethod(method) ? ["authorization"] : authOptions.tokenSources,
  });
  if (result.ok) {
    return result;
  }

  if (result.code === "missing_config") {
    return { ok: false, response: authMisconfigured() };
  }

  return { ok: false, response: unauthorized() };
}

async function requireAuthenticatedProfile(
  request: Request,
  env: WorkerEnv,
  method: string,
  options: WorkerApiOptions,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; response: Response }> {
  const sessionResult = await requireClerkSession(request, env, method, options);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return requireBootstrappedProfile(sessionResult.session, env, options);
}

async function resolveOptionalAuthenticatedProfile(
  request: Request,
  env: WorkerEnv,
  options: WorkerApiOptions,
): Promise<{ ok: true; profile: UserProfile | null } | { ok: false; response: Response }> {
  const sessionResult = await authenticateClerkRequest(request, env, options);
  if (!sessionResult.ok) {
    return { ok: true, profile: null };
  }

  const profileResult = await requireBootstrappedProfile(sessionResult.session, env, options);
  if (!profileResult.ok) {
    return profileResult.response.status >= 500
      ? { ok: false, response: profileResult.response }
      : { ok: true, profile: null };
  }

  return { ok: true, profile: profileResult.profile };
}

function isMutationMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
