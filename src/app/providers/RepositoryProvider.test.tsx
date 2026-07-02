import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../../repositories/memory/MemoryRepositories";
import { RepositoryProvider, useRepositories } from "./RepositoryProvider";

function RepositoryProbe() {
  const repositories = useRepositories();
  return <div>{repositories ? "ready" : "missing"}</div>;
}

describe("RepositoryProvider", () => {
  it("provides repository contracts to descendants", () => {
    render(
      <RepositoryProvider repositories={createMemoryRepositories()}>
        <RepositoryProbe />
      </RepositoryProvider>,
    );

    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("throws when the repository context is missing", () => {
    expect(() => render(<RepositoryProbe />)).toThrow("useRepositories must be used");
  });
});
