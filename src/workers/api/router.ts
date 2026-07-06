import { Hono } from "hono";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import {
  authenticateClerkRequest,
  type ClerkAuthenticationOptions,
  type ClerkSession,
} from "../auth/clerk";
import {
  handleDeleteInventory,
  handleListInventory,
  handlePatchInventory,
  handlePostInventory,
  type InventoryRouteOptions,
} from "./inventory";
import {
  handleGetMe,
  handlePostMeProfile,
  type ProfileRouteOptions,
  requireBootstrappedProfile,
} from "./profile";
import {
  handleDeleteRepository,
  handleGetRepository,
  handleGetRepositoryDependencies,
  handleListRepositories,
  handlePatchRepository,
  handlePostRepository,
  type RepositoryRouteOptions,
} from "./repositories";
import {
  authMisconfigured,
  jsonResponse,
  methodNotAllowed,
  notFound,
  notImplemented,
  unauthorized,
} from "./responses";
import type { WorkerEnv } from "./types";

export type WorkerApiOptions = ClerkAuthenticationOptions &
  ProfileRouteOptions &
  InventoryRouteOptions &
  RepositoryRouteOptions;

type WorkerApiHonoEnv = {
  Bindings: WorkerEnv;
};

type ScaffoldRoute = {
  message: string;
  path: string;
  protectedMethods?: readonly string[];
  publicMethods?: readonly string[];
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
    allowedMethods: ["GET"],
    path: "/api/repos/:owner/:repo/dependencies",
  },
  inventory: { allowedMethods: ["GET", "POST"], path: "/api/inventory" },
  inventoryItem: { allowedMethods: ["PATCH", "DELETE"], path: "/api/inventory/:id" },
} as const satisfies Record<string, HeadMethodRoute>;

const repoScaffoldRoutes: ScaffoldRoute[] = [
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/star",
    protectedMethods: ["POST", "DELETE"],
  },
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/fork",
    protectedMethods: ["POST"],
  },
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/bom",
    publicMethods: ["GET"],
  },
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/security",
    publicMethods: ["GET"],
  },
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/audit",
    protectedMethods: ["POST"],
  },
  {
    message: "Recipe repository API is not implemented yet.",
    path: "/api/repos/:owner/:repo/cooking-logs",
    protectedMethods: ["POST"],
    publicMethods: ["GET"],
  },
];

const profileScaffoldRoutes: ScaffoldRoute[] = [
  {
    message: "Profile API is not implemented yet.",
    path: "/api/users/:username/profile",
    publicMethods: ["GET"],
  },
  {
    message: "Profile API is not implemented yet.",
    path: "/api/users/:username/contributions",
    publicMethods: ["GET"],
  },
  {
    message: "Profile API is not implemented yet.",
    path: "/api/users/:username/contributions/:date",
    publicMethods: ["GET"],
  },
];

const headMethodRoutes: HeadMethodRoute[] = [
  ...Object.values(coreRoutes),
  ...toHeadMethodRoutes(repoScaffoldRoutes),
  ...toHeadMethodRoutes(profileScaffoldRoutes),
];

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
  app.all(coreRoutes.repositoryDependencies.path, () =>
    methodNotAllowed(coreRoutes.repositoryDependencies.allowedMethods),
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

  registerScaffoldRoutes(app, repoScaffoldRoutes, options);
  registerScaffoldRoutes(app, profileScaffoldRoutes, options);

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

function registerScaffoldRoutes(
  app: Hono<WorkerApiHonoEnv>,
  routes: readonly ScaffoldRoute[],
  options: WorkerApiOptions,
): void {
  for (const route of routes) {
    registerScaffoldRoute(app, route, options);
  }
}

function registerScaffoldRoute(
  app: Hono<WorkerApiHonoEnv>,
  route: ScaffoldRoute,
  options: WorkerApiOptions,
): void {
  const publicMethods = [...(route.publicMethods ?? [])];
  const protectedMethods = [...(route.protectedMethods ?? [])];
  const allowedMethods = [...publicMethods, ...protectedMethods];

  if (publicMethods.length > 0) {
    app.on(publicMethods, route.path, () => notImplemented(route.message));
  }

  if (protectedMethods.length > 0) {
    app.on(protectedMethods, route.path, (context) =>
      handleProtectedScaffold(
        context.req.raw,
        context.env,
        context.req.raw.method,
        route.message,
        options,
      ),
    );
  }

  app.all(route.path, () => methodNotAllowed(allowedMethods));
}

async function handleProtectedScaffold(
  request: Request,
  env: WorkerEnv,
  method: string,
  message: string,
  options: WorkerApiOptions,
): Promise<Response> {
  const profileResult = await requireAuthenticatedProfile(request, env, method, options);
  if (!profileResult.ok) {
    return profileResult.response;
  }

  return notImplemented(message);
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  return normalized;
}

function pathnameFromRequest(request: Request): string {
  return normalizePathname(new URL(request.url).pathname);
}

function toHeadMethodRoutes(routes: readonly ScaffoldRoute[]): HeadMethodRoute[] {
  return routes
    .map((route) => ({
      allowedMethods: [...(route.publicMethods ?? []), ...(route.protectedMethods ?? [])],
      path: route.path,
    }))
    .filter((route) => route.allowedMethods.length > 0);
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

function isMutationMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
