import { describe, expect, it } from "vitest";
import type { ClerkAuthenticationOptions } from "../auth/clerk";
import worker from "./index";
import { handleApiRequest } from "./router";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
};

const configuredEnv: WorkerEnv = {
  DB: {} as D1Database,
  CLERK_AUTHORIZED_PARTIES: "https://example.test",
  CLERK_JWT_KEY: "test-jwt-key",
};

const validSessionAuth: ClerkAuthenticationOptions = {
  verifyToken: async () =>
    ({
      azp: "https://example.test",
      sid: "sess_test",
      sub: "user_test",
    }) as Awaited<ReturnType<NonNullable<ClerkAuthenticationOptions["verifyToken"]>>>,
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("Worker API router", () => {
  it("returns the health response through the Worker fetch entrypoint", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"), env);

    await expect(parseJson(response)).resolves.toEqual({
      ok: true,
      service: "SeasoningBOM",
      persistence: "d1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("allows HEAD health checks without a JSON body", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/health", { method: "HEAD" }),
      env,
    );

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("rejects unsupported methods with an Allow header", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/health", { method: "POST" }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/nope"), env);

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "No API route matches /api/nope.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("does not treat protected routes as authenticated without a Clerk bearer token", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/me"), env);

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("fails closed when Clerk auth is not configured", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "auth_misconfigured",
        message: "Authentication is not configured.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("recognizes authenticated profile routes without implementing profile lookup yet", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      validSessionAuth,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
  });

  it("keeps profile bootstrap behind POST and a valid Clerk session", async () => {
    const getResponse = await handleApiRequest(
      new Request("https://example.test/api/me/profile", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      validSessionAuth,
    );
    const postResponse = await handleApiRequest(
      new Request("https://example.test/api/me/profile", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      validSessionAuth,
    );

    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");
    expect(postResponse.status).toBe(501);
    await expect(parseJson(postResponse)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile bootstrap API is not implemented yet.",
      },
    });
  });

  it("recognizes planned public repository routes without implementing them yet", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/shoma/curry-rice"),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Recipe repository API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
  });

  it("keeps planned repository mutation routes authenticated in the scaffold", async () => {
    const unauthenticated = await handleApiRequest(
      new Request("https://example.test/api/repos", { method: "POST" }),
      env,
    );
    const authenticated = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      validSessionAuth,
    );

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(501);
    await expect(parseJson(authenticated)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Recipe repository API is not implemented yet.",
      },
    });
  });

  it("requires bearer auth instead of Clerk cookies for mutation routes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      validSessionAuth,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("allows Clerk cookies for protected GET routes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          cookie: "__session=fake-session",
        },
      }),
      configuredEnv,
      validSessionAuth,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
  });

  it("keeps private inventory routes authenticated in the scaffold", async () => {
    const unauthenticated = await handleApiRequest(
      new Request("https://example.test/api/inventory"),
      env,
    );
    const authenticated = await handleApiRequest(
      new Request("https://example.test/api/inventory", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      validSessionAuth,
    );

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(501);
    await expect(parseJson(authenticated)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Inventory API is not implemented yet.",
      },
    });
  });

  it("recognizes planned public profile routes without implementing them yet", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/users/shoma/profile"),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
  });
});
