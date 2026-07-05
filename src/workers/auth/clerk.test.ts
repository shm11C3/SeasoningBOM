import { describe, expect, it, vi } from "vitest";
import type { D1Database, WorkerEnv } from "../api/types";
import {
  authenticateClerkRequest,
  extractClerkSessionToken,
  parseAuthorizedParties,
  type VerifyClerkToken,
} from "./clerk";

const env: WorkerEnv = {
  DB: {} as D1Database,
  CLERK_AUTHORIZED_PARTIES: "https://seasoningbom.example, http://localhost:5173",
  CLERK_JWT_KEY: "test-jwt-key",
};

const verifiedClaims = {
  azp: "https://seasoningbom.example",
  sid: "sess_test",
  sub: "user_test",
} as Awaited<ReturnType<VerifyClerkToken>>;

describe("Clerk Worker authentication", () => {
  it("extracts a bearer token before the Clerk session cookie", () => {
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer bearer-token",
        cookie: "__session=cookie-token",
      },
    });

    expect(extractClerkSessionToken(request)).toEqual({
      source: "authorization",
      token: "bearer-token",
    });
  });

  it("extracts a Clerk session cookie for same-origin requests", () => {
    const request = new Request("https://example.test/api/me", {
      headers: {
        cookie: "theme=light; __session=cookie-token%3Dwith-equals; other=value",
      },
    });

    expect(extractClerkSessionToken(request)).toEqual({
      source: "cookie",
      token: "cookie-token=with-equals",
    });
  });

  it("ignores malformed Clerk session cookie encoding", () => {
    const request = new Request("https://example.test/api/me", {
      headers: {
        cookie: "__session=%E0%A4%A",
      },
    });

    expect(extractClerkSessionToken(request)).toBeNull();
  });

  it("can restrict token extraction to authorization headers", () => {
    const request = new Request("https://example.test/api/me", {
      headers: {
        cookie: "__session=cookie-token",
      },
    });

    expect(extractClerkSessionToken(request, ["authorization"])).toBeNull();
  });

  it("parses comma-separated authorized parties", () => {
    expect(parseAuthorizedParties(" https://a.example, ,http://localhost:5173 ")).toEqual([
      "https://a.example",
      "http://localhost:5173",
    ]);
  });

  it("rejects requests without a Clerk session token", async () => {
    await expect(
      authenticateClerkRequest(new Request("https://example.test/api/me"), env),
    ).resolves.toEqual({
      code: "missing_token",
      ok: false,
    });
  });

  it("rejects requests when Clerk verification config is missing", async () => {
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, { DB: {} as D1Database })).resolves.toEqual({
      code: "missing_config",
      ok: false,
    });
  });

  it("verifies the token with the configured JWT key and authorized parties", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(async () => verifiedClaims);
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      ok: true,
      session: {
        authProvider: "clerk",
        authSubject: "user_test",
        claims: verifiedClaims,
        sessionId: "sess_test",
        tokenSource: "authorization",
      },
    });
    expect(verifyToken).toHaveBeenCalledWith("token", {
      authorizedParties: ["https://seasoningbom.example", "http://localhost:5173"],
      jwtKey: "test-jwt-key",
    });
  });

  it("rejects invalid or unverifiable tokens", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(async () => {
      throw new Error("bad token");
    });
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      code: "invalid_token",
      ok: false,
    });
  });

  it("rejects verified claims without a Clerk user subject", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(
      async () =>
        ({
          sid: "sess_test",
        }) as Awaited<ReturnType<VerifyClerkToken>>,
    );
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      code: "invalid_token",
      ok: false,
    });
  });

  it("rejects verified claims without a Clerk session id", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(
      async () =>
        ({
          azp: "https://seasoningbom.example",
          sub: "user_test",
        }) as Awaited<ReturnType<VerifyClerkToken>>,
    );
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      code: "invalid_token",
      ok: false,
    });
  });

  it("rejects verified claims without an allowed authorized party", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(
      async () =>
        ({
          azp: "https://evil.example",
          sid: "sess_test",
          sub: "user_test",
        }) as Awaited<ReturnType<VerifyClerkToken>>,
    );
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      code: "invalid_token",
      ok: false,
    });
  });

  it("rejects verified claims with no authorized party claim", async () => {
    const verifyToken = vi.fn<VerifyClerkToken>(
      async () =>
        ({
          sid: "sess_test",
          sub: "user_test",
        }) as Awaited<ReturnType<VerifyClerkToken>>,
    );
    const request = new Request("https://example.test/api/me", {
      headers: {
        authorization: "Bearer token",
      },
    });

    await expect(authenticateClerkRequest(request, env, { verifyToken })).resolves.toEqual({
      code: "invalid_token",
      ok: false,
    });
  });
});
