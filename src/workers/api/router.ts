import { authenticateClerkRequest, type ClerkAuthenticationOptions } from "../auth/clerk";
import {
  authMisconfigured,
  jsonResponse,
  methodNotAllowed,
  notFound,
  notImplemented,
  unauthorized,
} from "./responses";
import type { WorkerEnv } from "./types";

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
  authOptions: ClerkAuthenticationOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/api/health") {
    return handleHealth(request);
  }

  if (pathname === "/api/me") {
    return handleProtectedScaffold(
      request,
      env,
      ["GET"],
      "Profile API is not implemented yet.",
      authOptions,
    );
  }

  if (pathname === "/api/me/profile") {
    return handleProtectedScaffold(
      request,
      env,
      ["POST"],
      "Profile bootstrap API is not implemented yet.",
      authOptions,
    );
  }

  const repoMatch = findMatcher(pathname, repoRouteMatchers);
  if (repoMatch) {
    return handleRouteScaffold(
      request,
      env,
      repoMatch,
      "Recipe repository API is not implemented yet.",
      authOptions,
    );
  }

  const inventoryMatch = findMatcher(pathname, inventoryRouteMatchers);
  if (inventoryMatch) {
    return handleRouteScaffold(
      request,
      env,
      inventoryMatch,
      "Inventory API is not implemented yet.",
      authOptions,
    );
  }

  const profileMatch = findMatcher(pathname, profileRouteMatchers);
  if (profileMatch) {
    return handleRouteScaffold(
      request,
      env,
      profileMatch,
      "Profile API is not implemented yet.",
      authOptions,
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

async function handleProtectedScaffold(
  request: Request,
  env: WorkerEnv,
  allowedMethods: readonly string[],
  message: string,
  authOptions: ClerkAuthenticationOptions,
): Promise<Response> {
  if (!allowedMethods.includes(request.method)) {
    return methodNotAllowed(allowedMethods);
  }

  const authResponse = await requireClerkSession(request, env, request.method, authOptions);
  if (authResponse) {
    return authResponse;
  }

  return notImplemented(message);
}

async function handleRouteScaffold(
  request: Request,
  env: WorkerEnv,
  matcher: RouteMatcher,
  message: string,
  authOptions: ClerkAuthenticationOptions,
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

  const authResponse = await requireClerkSession(request, env, request.method, authOptions);
  if (authResponse) {
    return authResponse;
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
): Promise<Response | null> {
  const result = await authenticateClerkRequest(request, env, {
    ...authOptions,
    tokenSources: isMutationMethod(method) ? ["authorization"] : authOptions.tokenSources,
  });
  if (result.ok) {
    return null;
  }

  if (result.code === "missing_config") {
    return authMisconfigured();
  }

  return unauthorized();
}

function isMutationMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
