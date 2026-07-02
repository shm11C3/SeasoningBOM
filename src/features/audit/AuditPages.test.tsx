import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixedNow,
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { EolDashboardPage } from "./EolDashboardPage";
import { SecurityPage } from "./SecurityPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("audit pages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups EOL dashboard inventory by visible lifecycle status", () => {
    liveDataMock.current = {
      inventoryItems: [
        makeInventoryItem({ id: "deprecated", name: "tofu", bestBeforeDate: "2026-07-02" }),
        makeInventoryItem({ id: "eol", name: "rice", bestBeforeDate: "2026-06-30" }),
        makeInventoryItem({
          id: "unsupported",
          name: "chicken",
          useByDate: "2026-06-30",
        }),
        makeInventoryItem({ hazardous: true, id: "hazardous", name: "mushroom" }),
        makeInventoryItem({ id: "active", name: "salt", bestBeforeDate: "2026-08-01" }),
      ],
      settings: makeSettings(),
    };

    render(<EolDashboardPage />);

    expect(screen.getByRole("heading", { name: "deprecated" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "eol" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "unsupported" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "hazardous" })).toBeInTheDocument();
    expect(screen.getAllByText("Excluded from recommendations")).toHaveLength(2);
    expect(screen.queryByText("salt")).not.toBeInTheDocument();
  });

  it("shows an empty EOL dashboard when inventory is active", () => {
    liveDataMock.current = {
      inventoryItems: [makeInventoryItem({ bestBeforeDate: "2026-08-01" })],
      settings: makeSettings(),
    };

    render(<EolDashboardPage />);

    expect(screen.getByText("No lifecycle warnings")).toBeInTheDocument();
  });

  it("groups cross-recipe security issues and links back to repositories", () => {
    const recipe = makeRecipe();
    liveDataMock.current = {
      components: [makeComponent({ ingredientName: "chicken", quantity: 200, unit: "g" })],
      inventoryItems: [
        makeInventoryItem({
          name: "chicken",
          quantity: 200,
          unit: "g",
          useByDate: "2026-06-30",
        }),
      ],
      recipes: [recipe],
      settings: makeSettings(),
    };

    render(<SecurityPage />);

    expect(screen.getByRole("heading", { name: "critical" })).toBeInTheDocument();
    expect(screen.getByText("chicken is unsupported and excluded from recommendations"));
    expect(screen.getAllByRole("link", { name: "Curry Rice" })[0]).toHaveAttribute(
      "href",
      "/repositories/curry-rice",
    );
  });

  it("shows an empty security state with no issues", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [makeRecipe()],
      settings: makeSettings(),
    };

    render(<SecurityPage />);

    expect(screen.getByText("No active security alerts")).toBeInTheDocument();
  });
});
