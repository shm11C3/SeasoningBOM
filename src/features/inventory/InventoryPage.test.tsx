import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeInventoryItem, makeSettings } from "../../test/factories/domainFactories";
import { InventoryPage } from "./InventoryPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("InventoryPage", () => {
  it("validates, saves, edits, cancels, and deletes inventory items", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const item = makeInventoryItem({
      bestBeforeDate: "2026-07-01",
      id: "inventory-rice",
      name: "rice",
      quantity: 2,
    });
    liveDataMock.current = {
      inventoryItems: [item],
      repositories: {
        inventory: {
          delete: deleteItem,
          save,
        },
      },
      settings: makeSettings(),
    };

    render(<InventoryPage />);

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.getByText("Ingredient name is required.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), " carrot ");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.selectOptions(screen.getByLabelText("Category"), "produce");
    await user.selectOptions(screen.getByLabelText("Unit"), "piece");
    await user.selectOptions(screen.getByLabelText("Hazardous"), "yes");
    await user.type(screen.getByLabelText("Best-before date"), "2026-07-10");
    await user.type(screen.getByLabelText("Use-by date"), "2026-07-11");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        bestBeforeDate: "2026-07-10",
        hazardous: true,
        name: "carrot",
        quantity: 3,
        useByDate: "2026-07-11",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toHaveValue("rice");
    expect(screen.getByRole("button", { name: "Save ingredient" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add ingredient" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("inventory-rice"));
  });

  it("saves minimal items without optional dates and displays missing date labels", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    liveDataMock.current = {
      inventoryItems: [
        makeInventoryItem({
          bestBeforeDate: undefined,
          id: "inventory-salt",
          name: "salt",
          quantity: 1,
          useByDate: undefined,
        }),
      ],
      repositories: {
        inventory: {
          delete: vi.fn(),
          save,
        },
      },
      settings: makeSettings(),
    };

    render(<InventoryPage />);

    expect(screen.getByText("No EOL")).toBeInTheDocument();
    expect(screen.getByText("No use-by")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "pepper");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        bestBeforeDate: undefined,
        name: "pepper",
        quantity: 0,
        useByDate: undefined,
      }),
    );
  });
});
