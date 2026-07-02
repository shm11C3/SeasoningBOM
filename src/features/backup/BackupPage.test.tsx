import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { BackupPage } from "./BackupPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const downloadJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../download", () => ({
  downloadJson: downloadJsonMock,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("BackupPage", () => {
  it("exports and imports backup JSON", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe();
    const component = makeComponent();
    const inventoryItem = makeInventoryItem();
    const backup = {
      format: "SeasoningBOMAppBackup" as const,
      version: "0.1.0",
      exportedAt: "2026-07-01T00:00:00.000Z",
      repositories: [recipe],
      components: [component],
      inventoryItems: [inventoryItem],
      settings: makeSettings(),
    };
    const importAll = vi.fn().mockResolvedValue({
      importedComponents: 1,
      importedInventoryItems: 1,
      importedRepositories: 1,
      warnings: [],
    });

    liveDataMock.current = {
      components: [component],
      inventoryItems: [inventoryItem],
      recipes: [recipe],
      repositories: {
        backup: {
          exportAll: vi.fn().mockResolvedValue(backup),
          importAll,
        },
      },
    };

    render(<BackupPage />);

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(downloadJsonMock).toHaveBeenCalledWith("seasoning-bom-backup-2026-07-01.json", backup);
    expect(screen.getByText("Backup exported.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Conflict strategy"), "duplicate");
    fireEvent.change(screen.getByLabelText("Backup JSON"), {
      target: { value: JSON.stringify(backup) },
    });
    await user.click(screen.getByRole("button", { name: "Import JSON" }));

    expect(importAll).toHaveBeenCalledWith(backup, { conflictStrategy: "duplicate" });
    expect(
      await screen.findByText("Imported 1 repositories, 1 components, and 1 inventory items."),
    ).toBeInTheDocument();
  });

  it("reports invalid import JSON", async () => {
    const user = userEvent.setup();
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [],
      repositories: {
        backup: {
          exportAll: vi.fn(),
          importAll: vi.fn(),
        },
      },
    };

    render(<BackupPage />);

    fireEvent.change(screen.getByLabelText("Backup JSON"), {
      target: { value: "{bad json" },
    });
    await user.click(screen.getByRole("button", { name: "Import JSON" }));

    await waitFor(() => expect(screen.getByText(/Expected property name/)).toBeInTheDocument());
  });

  it("loads backup text from a selected file", async () => {
    const user = userEvent.setup();
    const backup = {
      format: "SeasoningBOMAppBackup" as const,
      version: "0.1.0",
      exportedAt: "2026-07-01T00:00:00.000Z",
      repositories: [],
      components: [],
      inventoryItems: [],
      settings: makeSettings(),
    };
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [],
      repositories: {
        backup: {
          exportAll: vi.fn(),
          importAll: vi.fn(),
        },
      },
    };

    render(<BackupPage />);

    await user.upload(
      screen.getByLabelText("Backup file"),
      new File([JSON.stringify(backup)], "backup.json", { type: "application/json" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Backup JSON")).toHaveValue(JSON.stringify(backup)),
    );
  });

  it("keeps the current backup text when the file picker is cancelled", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [],
      repositories: {
        backup: {
          exportAll: vi.fn(),
          importAll: vi.fn(),
        },
      },
    };

    render(<BackupPage />);

    fireEvent.change(screen.getByLabelText("Backup JSON"), {
      target: { value: "unchanged" },
    });
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [] },
    });

    expect(screen.getByLabelText("Backup JSON")).toHaveValue("unchanged");
  });

  it("reports non-Error import failures with a generic message", async () => {
    const user = userEvent.setup();
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [],
      repositories: {
        backup: {
          exportAll: vi.fn(),
          importAll: vi.fn().mockRejectedValue("nope"),
        },
      },
    };

    render(<BackupPage />);

    fireEvent.change(screen.getByLabelText("Backup JSON"), {
      target: { value: "{}" },
    });
    await user.click(screen.getByRole("button", { name: "Import JSON" }));

    expect(await screen.findByText("Import failed.")).toBeInTheDocument();
  });
});
