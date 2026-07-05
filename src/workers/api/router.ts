import {
  authenticateClerkRequest,
  type ClerkAuthenticationOptions,
  type ClerkSession,
} from "../auth/clerk";
import {
  handleGetMe,
  handlePostMeProfile,
  type ProfileRouteOptions,
  requireBootstrappedProfile,
} from "./profile";
import {
  authMisconfigured,
  jsonResponse,
  methodNotAllowed,
  notFound,
  notImplemented,
  unauthorized,
} from "./responses";
import type { WorkerEnv } from "./types";

export type WorkerApiOptions = ClerkAuthenticationOptions & ProfileRouteOptions;

type RouteMatcher = {
  protectedMethods?: readonly string[];
  publicMethods?: readonly string[];
  pattern: RegExp;
};

const repoRouteMatchers: RouteMatcher[] = [
  { pattern: /^\/api\/repos$/, protectedMethods: ["POST"], publicMethods: ["GET"] },
  {
    pattern: /^\/api\/repos\/[^/]+\/[^/]+$/,
    protectedMethods: ["PATCH", "DELETE"],
    publicMethods: ["GET"],
  },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/star$/, protectedMethods: ["POST", "DELETE"] },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/fork$/, protectedMethods: ["POST"] },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/bom$/, publicMethods: ["GET"] },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/dependencies$/, publicMethods: ["GET"] },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/security$/, publicMethods: ["GET"] },
  { pattern: /^\/api\/repos\/[^/]+\/[^/]+\/audit$/, protectedMethods: ["POST"] },
  {
    pattern: /^\/api\/repos\/[^/]+\/[^/]+\/cooking-logs$/,
    protectedMethods: ["POST"],
    publicMethods: ["GET"],
  },
];

const inventoryRouteMatchers: RouteMatcher[] = [
  { pattern: /^\/api\/inventory$/, protectedMethods: ["GET", "POST"] },
  { pattern: /^\/api\/inventory\/[^/]+$/, protectedMethods: ["PATCH", "DELETE"] },
];

const profileRouteMatchers: RouteMatcher[] = [
  { pattern: /^\/api\/users\/[^/]+\/profile$/, publicMethods: ["GET"] },
  { pattern: /^\/api\/users\/[^/]+\/contributions$/, publicMethods: ["GET"] },
  { pattern: /^\/api\/users\/[^/]+\/contributions\/[^/]+$/, publicMethods: ["GET"] },
];

export async function handleApiRequest(
  request: Request,
  env: WorkerEnv,
  options: WorkerApiOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/api/health") {
    return handleHealth(request);
  }

  if (pathname === "/api/me") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const sessionResult = await requireClerkSession(request, env, "GET", options);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return handleGetMe(sessionResult.session, env, options);
  }

  if (pathname === "/api/me/profile") {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const sessionResult = await requireClerkSession(request, env, "POST", options);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    return handlePostMeProfile(request, sessionResult.session, env, options);
  }

  const repoMatch = findMatcher(pathname, repoRouteMatchers);
  if (repoMatch) {
    return handleRouteScaffold(
      request,
      env,
      repoMatch,
      "Recipe repository API is not implemented yet.",
      options,
    );
  }

  const inventoryMatch = findMatcher(pathname, inventoryRouteMatchers);
  if (inventoryMatch) {
    return handleRouteScaffold(
      request,
      env,
      inventoryMatch,
      "Inventory API is not implemented yet.",
      options,
    );
  }

  const profileMatch = findMatcher(pathname, profileRouteMatchers);
  if (profileMatch) {
    return handleRouteScaffold(
      request,
      env,
      profileMatch,
      "Profile API is not implemented yet.",
      options,
    );
  }

  return notFound(pathname);
}

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

async function handleRouteScaffold(
  request: Request,
  env: WorkerEnv,
  matcher: RouteMatcher,
  message: string,
  options: WorkerApiOptions,
): Promise<Response> {
  const publicMethods = matcher.publicMethods ?? [];
  const protectedMethods = matcher.protectedMethods ?? [];
  const allowedMethods = [...publicMethods, ...protectedMethods];

  if (!allowedMethods.includes(request.method)) {
    return methodNotAllowed(allowedMethods);
  }

  if (publicMethods.includes(request.method)) {
    return notImplemented(message);
  }

  const sessionResult = await requireClerkSession(request, env, request.method, options);
  if (!sessionResult.ok) {
    return sessionResult.response;
  }

  const profileResult = await requireBootstrappedProfile(sessionResult.session, env, options);
  if (!profileResult.ok) {
    return profileResult.response;
  }

  return notImplemented(message);
}

function findMatcher(pathname: string, matchers: readonly RouteMatcher[]): RouteMatcher | null {
  return matchers.find((matcher) => matcher.pattern.test(pathname)) ?? null;
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  return normalized;
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

function isMutationMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
