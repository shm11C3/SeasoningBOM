import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../test/factories/domainFactories";
import { ProfilePage } from "./ProfilePage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("ProfilePage", () => {
  it("shows a local prototype profile with pinned repositories", () => {
    liveDataMock.current = {
      recipes: [
        makeRecipe(),
        makeRecipe({ id: "recipe-private", slug: "private-stew", visibility: "private" }),
        makeRecipe({ id: "recipe-other", ownerHandle: "other", slug: "other-soup" }),
      ],
    };

    render(<ProfilePage username="me" />);

    expect(screen.getByRole("heading", { name: "me" })).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
    const curryCard = screen.getByRole("link", { name: /me\/curry-rice/ });
    expect(curryCard).toHaveAttribute("href", "/me/curry-rice");
    expect(within(curryCard).getByText("public")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /me\/private-stew/ })).toHaveAttribute(
      "href",
      "/me/private-stew",
    );
    expect(screen.queryByText("other/other-soup")).not.toBeInTheDocument();
  });

  it("shows an empty state for unknown profiles", () => {
    liveDataMock.current = {
      recipes: [makeRecipe()],
    };

    render(<ProfilePage username="missing" />);

    expect(screen.getByText("Profile not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });
});
