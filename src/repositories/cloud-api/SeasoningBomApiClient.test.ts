import { describe, expect, it, vi } from "vitest";
import { CloudApiError, createSeasoningBomApiClient } from "./SeasoningBomApiClient";

describe("SeasoningBomApiClient", () => {
  it.each([undefined, "", "   "])("keeps cloud mode disabled for %j", (baseUrl) => {
    expect(createSeasoningBomApiClient(baseUrl)).toBeNull();
  });

  it("loads profile, contributions, contribution days, and public repositories", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ profile: { id: "profile_1", username: "test user" } }))
      .mockResolvedValueOnce(jsonResponse({ days: [], totalContributions: 0 }))
      .mockResolvedValueOnce(jsonResponse({ date: "2026-07-23", events: [] }))
      .mockResolvedValueOnce(jsonResponse({ repositories: [{ id: "repo_1" }] }));
    const client = createSeasoningBomApiClient(" /api/ ", fetcher);

    await expect(client?.getPublicProfile("test user")).resolves.toEqual({
      id: "profile_1",
      username: "test user",
    });
    await expect(client?.getUserContributions("test user")).resolves.toEqual({
      days: [],
      totalContributions: 0,
    });
    await expect(client?.getUserContributionDay("test user", "2026-07-23")).resolves.toEqual({
      date: "2026-07-23",
      events: [],
    });
    await expect(client?.listPublicRepositories()).resolves.toEqual([{ id: "repo_1" }]);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/users/test%20user/profile",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/users/test%20user/contributions/2026-07-23",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/repos", expect.any(Object));
  });

  it("preserves structured API errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "not_found", message: "Profile not found." } },
          { status: 404 },
        ),
      );
    const client = createSeasoningBomApiClient("/api", fetcher);

    await expect(client?.getPublicProfile("missing")).rejects.toEqual(
      new CloudApiError(404, "Profile not found.", "not_found"),
    );
  });

  it("uses safe fallback errors for malformed error responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: null }, { status: 500 }))
      .mockResolvedValueOnce(new Response("not-json", { status: 502 }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 42, message: false } }, { status: 503 }),
      );
    const client = createSeasoningBomApiClient("/api", fetcher);

    await expect(client?.listPublicRepositories()).rejects.toMatchObject({
      message: "The API request failed.",
      status: 500,
    });
    await expect(client?.listPublicRepositories()).rejects.toMatchObject({
      message: "The API request failed.",
      status: 502,
    });
    await expect(client?.listPublicRepositories()).rejects.toMatchObject({
      code: undefined,
      message: "The API request failed.",
      status: 503,
    });
  });

  it("rejects invalid JSON from successful responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json"));
    const client = createSeasoningBomApiClient("/api", fetcher);

    await expect(client?.listPublicRepositories()).rejects.toMatchObject({
      message: "The API returned an invalid JSON response.",
      status: 200,
    });
  });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
