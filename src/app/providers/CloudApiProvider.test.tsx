import { render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SeasoningBomApiClient } from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import { CloudApiProvider, useCloudApi } from "./CloudApiProvider";

describe("CloudApiProvider", () => {
  it("provides an injected client", () => {
    const client = createClient();

    render(
      <CloudApiProvider client={client}>
        <Probe />
      </CloudApiProvider>,
    );

    expect(screen.getByText("cloud enabled")).toBeInTheDocument();
  });

  it("can explicitly keep the local prototype active", () => {
    render(
      <CloudApiProvider client={null}>
        <Probe />
      </CloudApiProvider>,
    );

    expect(screen.getByText("local prototype")).toBeInTheDocument();
  });

  it("creates a browser client for an explicit Cloud API base URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ repositories: [] })));
    render(
      <CloudApiProvider baseUrl="/api" fetcher={fetcher}>
        <RequestProbe />
      </CloudApiProvider>,
    );

    expect(await screen.findByText("0 cloud repositories")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/repos", expect.any(Object));
  });
});

function Probe() {
  return <span>{useCloudApi() ? "cloud enabled" : "local prototype"}</span>;
}

function RequestProbe() {
  const client = useCloudApi();
  const [count, setCount] = useState<number>();
  useEffect(() => {
    client?.listPublicRepositories().then((repositories) => setCount(repositories.length));
  }, [client]);
  return <span>{count === undefined ? "loading" : `${count} cloud repositories`}</span>;
}

function createClient(): SeasoningBomApiClient {
  return createCloudApiClientMock();
}
