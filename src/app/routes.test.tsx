import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { href, navigate, useRoute } from "./routes";

function RouteProbe() {
  const route = useRoute();
  return <div>{route.name === "not-found" ? route.path : route.name}</div>;
}

describe("routes", () => {
  it("returns app hrefs unchanged and navigates with popstate", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    render(
      <>
        <button type="button" onClick={() => navigate("/inventory")}>
          Go
        </button>
        <RouteProbe />
      </>,
    );

    expect(href("/backup")).toBe("/backup");
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("inventory")).toBeInTheDocument();
  });

  it.each([
    ["/security", "security"],
    ["/eol", "eol"],
    ["/backup", "backup"],
    ["/new", "repository-edit"],
    ["/users/me", "profile"],
    ["/me/curry-rice", "repository"],
    ["/me/curry-rice/edit", "repository-edit"],
    ["/repositories/curry-rice", "repository"],
    ["/repositories/curry-rice/edit", "repository-edit"],
    ["/elsewhere", "/elsewhere"],
  ])("parses %s", (path, expected) => {
    window.history.pushState({}, "", path);
    render(<RouteProbe />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
