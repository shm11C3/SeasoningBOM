import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { DashboardPage } from "./DashboardPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("DashboardPage repository cards", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders an empty state when no recipe repositories exist", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      ready: true,
      recipes: [],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    expect(screen.getByText("No recipe repositories")).toBeInTheDocument();
  });

  it("renders each repository as one card-level link", async () => {
    liveDataMock.current = {
      components: [makeComponent()],
      inventoryItems: [makeInventoryItem()],
      ready: true,
      recipes: [makeRecipe()],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    const user = userEvent.setup();
    const curryCard = await screen.findByRole("link", { name: "Open Curry Rice" });

    expect(curryCard).toHaveClass("repo-card", "repo-card-link");
    expect(curryCard).toHaveAttribute("href", "/repositories/curry-rice");
    expect(curryCard.querySelector("a")).toBeNull();
    expect(curryCard.querySelector(".repo-name")?.tagName).toBe("SPAN");
    expect(within(curryCard).getByText("Curry Rice")).toHaveClass("repo-name");

    await user.click(curryCard);

    await waitFor(() => expect(window.location.pathname).toBe("/repositories/curry-rice"));
  });

  it("renders repositories even when component data has not arrived for that recipe", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      ready: true,
      recipes: [makeRecipe({ tags: [] })],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    const curryCard = screen.getByRole("link", { name: "Open Curry Rice" });
    expect(within(curryCard).getByText("0 dependencies")).toBeInTheDocument();
    expect(within(curryCard).getByText("0 alerts")).toBeInTheDocument();
  });
});
