import { verifyToken as clerkVerifyToken } from "@clerk/backend";
import type { WorkerEnv } from "../api/types";

type ClerkJwtPayload = Awaited<ReturnType<typeof clerkVerifyToken>>;

export type ClerkSession = {
  authProvider: "clerk";
  authSubject: string;
  sessionId: string;
  tokenSource: ClerkSessionTokenSource;
  claims: ClerkJwtPayload;
};

export type ClerkAuthenticationFailureCode = "invalid_token" | "missing_config" | "missing_token";

export type ClerkAuthenticationResult =
  | {
      ok: true;
      session: ClerkSession;
    }
  | {
      code: ClerkAuthenticationFailureCode;
      ok: false;
    };

export type VerifyClerkToken = (
  token: string,
  options: {
    authorizedParties: string[];
    jwtKey: string;
  },
) => Promise<ClerkJwtPayload>;

export type ClerkSessionTokenSource = "authorization" | "cookie";

type ClerkSessionToken = {
  source: ClerkSessionTokenSource;
  token: string;
};

export type ClerkAuthenticationOptions = {
  tokenSources?: readonly ClerkSessionTokenSource[];
  verifyToken?: VerifyClerkToken;
};

export async function authenticateClerkRequest(
  request: Request,
  env: WorkerEnv,
  options: ClerkAuthenticationOptions = {},
): Promise<ClerkAuthenticationResult> {
  const sessionToken = extractClerkSessionToken(request, options.tokenSources);
  if (!sessionToken) {
    return { code: "missing_token", ok: false };
  }

  const jwtKey = env.CLERK_JWT_KEY?.trim();
  const authorizedParties = parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES);
  if (!jwtKey || authorizedParties.length === 0) {
    return { code: "missing_config", ok: false };
  }

  try {
    const claims = await (options.verifyToken ?? clerkVerifyToken)(sessionToken.token, {
      authorizedParties,
      jwtKey,
    });

    if (
      !hasUserSubject(claims) ||
      !hasSessionId(claims) ||
      !hasAllowedAuthorizedParty(claims, authorizedParties)
    ) {
      return { code: "invalid_token", ok: false };
    }

    return {
      ok: true,
      session: {
        authProvider: "clerk",
        authSubject: claims.sub,
        claims,
        sessionId: claims.sid,
        tokenSource: sessionToken.source,
      },
    };
  } catch {
    return { code: "invalid_token", ok: false };
  }
}

export function extractClerkSessionToken(
  request: Request,
  tokenSources: readonly ClerkSessionTokenSource[] = ["authorization", "cookie"],
): ClerkSessionToken | null {
  const bearerToken = tokenSources.includes("authorization")
    ? extractBearerToken(request.headers.get("authorization"))
    : null;
  if (bearerToken) {
    return {
      source: "authorization",
      token: bearerToken,
    };
  }

  const cookieToken = tokenSources.includes("cookie")
    ? extractCookieValue(request.headers.get("cookie"), "__session")
    : null;
  if (cookieToken) {
    return {
      source: "cookie",
      token: cookieToken,
    };
  }

  return null;
}

export function parseAuthorizedParties(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

function extractBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function hasUserSubject(claims: ClerkJwtPayload): claims is ClerkJwtPayload & { sub: string } {
  return typeof claims.sub === "string" && claims.sub.trim().length > 0;
}

function hasSessionId(claims: ClerkJwtPayload): claims is ClerkJwtPayload & { sid: string } {
  return typeof claims.sid === "string" && claims.sid.trim().length > 0;
}

function hasAllowedAuthorizedParty(
  claims: ClerkJwtPayload,
  authorizedParties: readonly string[],
): boolean {
  return typeof claims.azp === "string" && authorizedParties.includes(claims.azp);
}

function extractCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const pair of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = pair.split("=");
    if (rawName?.trim() !== cookieName) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    try {
      return rawValue ? decodeURIComponent(rawValue) : null;
    } catch {
      return null;
    }
  }

  return null;
}
