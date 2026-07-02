import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { navigate } from "../../app/routes";
import { EmptyState } from "./EmptyState";
import { DependencyLabel, LifecycleLabel, SeverityLabel } from "./Labels";
import { AppLink } from "./Link";
import {
  AlertIcon,
  AppMarkIcon,
  ArchiveIcon,
  ChecklistIcon,
  CodeIcon,
  DownloadIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  RepoIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "./TemporaryIcons";

describe("shared UI components", () => {
  it("renders empty state content and status labels", () => {
    render(
      <>
        <EmptyState title="Nothing here">Try again</EmptyState>
        <LifecycleLabel status="hazardous" />
        <LifecycleLabel status="unsupported" />
        <LifecycleLabel status="eol" />
        <LifecycleLabel status="deprecated" />
        <LifecycleLabel status="active" />
        <SeverityLabel severity="critical" />
        <SeverityLabel severity="high" />
        <SeverityLabel severity="medium" />
        <SeverityLabel severity="low" />
        <DependencyLabel value="optional" />
        <DependencyLabel value="required" />
        <DependencyLabel value="transitive" />
      </>,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Unsupported")).toBeInTheDocument();
    expect(screen.getByText("transitive")).toBeInTheDocument();
  });

  it("handles app links while preserving modified browser clicks", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    render(<AppLink to="/inventory">Inventory</AppLink>);

    await user.click(screen.getByRole("link", { name: "Inventory" }));
    expect(window.location.pathname).toBe("/inventory");

    navigate("/");
    const pushState = vi.spyOn(window.history, "pushState");
    render(<AppLink to="/">Home</AppLink>);
    fireEvent.click(screen.getByRole("link", { name: "Home" }), {
      button: 0,
      metaKey: true,
    });
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("renders all temporary icons as hidden SVGs", () => {
    const icons = [
      AlertIcon,
      AppMarkIcon,
      ArchiveIcon,
      ChecklistIcon,
      CodeIcon,
      DownloadIcon,
      PackageIcon,
      PencilIcon,
      PlusIcon,
      RepoIcon,
      ShieldIcon,
      StarIcon,
      TrashIcon,
      UploadIcon,
    ];

    const { container } = render(
      <div>
        {icons.map((Icon, index) => (
          <Icon key={String(index)} size={18} />
        ))}
      </div>,
    );

    expect(container.querySelectorAll("svg")).toHaveLength(icons.length);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
