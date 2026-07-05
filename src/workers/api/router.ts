import {
  clerkSessionVerificationNotWired,
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

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  void env;

  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/api/health") {
    return handleHealth(request);
  }

  if (pathname === "/api/me") {
    return handleProtectedScaffold(request, ["GET"]);
  }

  if (pathname === "/api/me/profile") {
    return handleProtectedScaffold(request, ["POST"]);
  }

  const repoMatch = findMatcher(pathname, repoRouteMatchers);
  if (repoMatch) {
    return handleRouteScaffold(request, repoMatch, "Recipe repository API is not implemented yet.");
  }

  const inventoryMatch = findMatcher(pathname, inventoryRouteMatchers);
  if (inventoryMatch) {
    return handleRouteScaffold(request, inventoryMatch, "Inventory API is not implemented yet.");
  }

  const profileMatch = findMatcher(pathname, profileRouteMatchers);
  if (profileMatch) {
    return handleRouteScaffold(request, profileMatch, "Profile API is not implemented yet.");
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

function handleProtectedScaffold(request: Request, allowedMethods: readonly string[]): Response {
  if (!allowedMethods.includes(request.method)) {
    return methodNotAllowed(allowedMethods);
  }

  if (!hasBearerToken(request)) {
    return unauthorized();
  }

  return clerkSessionVerificationNotWired();
}

function handleRouteScaffold(request: Request, matcher: RouteMatcher, message: string): Response {
  const publicMethods = matcher.publicMethods ?? [];
  const protectedMethods = matcher.protectedMethods ?? [];
  const allowedMethods = [...publicMethods, ...protectedMethods];

  if (!allowedMethods.includes(request.method)) {
    return methodNotAllowed(allowedMethods);
  }

  if (publicMethods.includes(request.method)) {
    return notImplemented(message);
  }

  if (!hasBearerToken(request)) {
    return unauthorized();
  }

  return clerkSessionVerificationNotWired();
}

function findMatcher(pathname: string, matchers: readonly RouteMatcher[]): RouteMatcher | null {
  return matchers.find((matcher) => matcher.pattern.test(pathname)) ?? null;
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  return normalized;
}

function hasBearerToken(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  return authorization.slice("Bearer ".length).trim().length > 0;
}
