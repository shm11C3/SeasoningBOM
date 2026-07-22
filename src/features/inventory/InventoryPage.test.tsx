import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudApiProvider } from "../../app/providers/CloudApiProvider";
import type { SeasoningBomApiClient } from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import { makeInventoryItem, makeSettings } from "../../test/factories/domainFactories";
import { InventoryPage } from "./InventoryPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const cloudProfileMock = vi.hoisted(() => ({
  current: { profile: null, status: "disabled" } as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

vi.mock("../../app/providers/CloudProfileProvider", () => ({
  useCloudProfile: () => cloudProfileMock.current,
}));

describe("InventoryPage", () => {
  beforeEach(() => {
    cloudProfileMock.current = { profile: null, status: "disabled" };
  });

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

  it("loads and mutates only the signed-in user's cloud inventory", async () => {
    const user = userEvent.setup();
    const rice = makeInventoryItem({ id: "inventory-rice", name: "rice", quantity: 2 });
    const carrot = makeInventoryItem({ id: "inventory-carrot", name: "carrot", quantity: 3 });
    const updatedRice = { ...rice, quantity: 4 };
    const createInventoryItem = vi.fn().mockResolvedValue(carrot);
    const deleteInventoryItem = vi.fn().mockResolvedValue(undefined);
    const listInventory = vi.fn().mockResolvedValue([rice]);
    const updateInventoryItem = vi.fn().mockResolvedValue(updatedRice);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    cloudProfileMock.current = {
      profile: { username: "test-cook" },
      status: "ready",
    };
    const client = createCloudApiClientMock({
      createInventoryItem,
      deleteInventoryItem,
      listInventory,
      updateInventoryItem,
    });

    renderCloudInventory(client);

    expect(await screen.findByText(/visible only to you/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "carrot");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() =>
      expect(createInventoryItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: "carrot", quantity: 3 }),
      ),
    );
    expect(await screen.findByText("carrot")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "4");
    await user.click(screen.getByRole("button", { name: "Save ingredient" }));
    await waitFor(() =>
      expect(updateInventoryItem).toHaveBeenCalledWith(
        "inventory-rice",
        expect.objectContaining({ name: "rice", quantity: 4 }),
      ),
    );

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    confirm.mockReturnValue(false);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(deleteInventoryItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save ingredient" })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(deleteInventoryItem).toHaveBeenCalledWith("inventory-rice"));
    expect(confirm).toHaveBeenCalledWith("Delete rice from your inventory?");
  });

  it.each([
    ["disabled", "Authentication must be configured"],
    ["signed-out", "Sign in to manage inventory"],
    ["needs-profile", "Finish profile setup"],
    ["error", "private inventory could not be opened"],
    ["loading", "Loading inventory"],
  ])("does not request private cloud inventory for profile state %s", (status, expected) => {
    const listInventory = vi.fn();
    cloudProfileMock.current = { profile: null, status };

    renderCloudInventory(createCloudApiClientMock({ listInventory }));

    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(listInventory).not.toHaveBeenCalled();
  });
});

function renderCloudInventory(client: SeasoningBomApiClient) {
  return render(
    <CloudApiProvider client={client}>
      <InventoryPage />
    </CloudApiProvider>,
  );
}
