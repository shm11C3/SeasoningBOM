import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SeasoningBomApiClient } from "../../repositories/cloud-api/SeasoningBomApiClient";
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
});

function Probe() {
  return <span>{useCloudApi() ? "cloud enabled" : "local prototype"}</span>;
}

function createClient(): SeasoningBomApiClient {
  return {
    getPublicProfile: vi.fn(),
    getUserContributionDay: vi.fn(),
    getUserContributions: vi.fn(),
    listPublicRepositories: vi.fn(),
  };
}
