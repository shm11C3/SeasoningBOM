import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileBootstrapPanel } from "../../features/profile/ProfileBootstrapPanel";
import { CloudApiError } from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import { AuthProvider } from "./AuthProvider";
import { CloudApiProvider } from "./CloudApiProvider";
import { CloudProfileProvider, useCloudProfile } from "./CloudProfileProvider";

const clerkMock = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  isLoaded: true,
  isSignedIn: true,
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  Show: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => null,
  useAuth: () => clerkMock,
}));

const profile = {
  contributionVisibility: "summary_only" as const,
  createdAt: "2026-07-23T00:00:00.000Z",
  id: "profile_1",
  updatedAt: "2026-07-23T00:00:00.000Z",
  username: "test-cook",
};

describe("CloudProfileProvider", () => {
  beforeEach(() => {
    clerkMock.getToken.mockResolvedValue("session-token");
    clerkMock.isLoaded = true;
    clerkMock.isSignedIn = true;
  });

  it("loads the profile for a signed-in Clerk session", async () => {
    const client = createCloudApiClientMock({
      getCurrentProfile: vi.fn().mockResolvedValue(profile),
    });

    renderProfile(client);

    expect(await screen.findByText("ready:test-cook")).toBeInTheDocument();
    expect(client.getCurrentProfile).toHaveBeenCalledOnce();
  });

  it("does not request a profile while signed out", async () => {
    clerkMock.isSignedIn = false;
    const client = createCloudApiClientMock();

    renderProfile(client);

    expect(await screen.findByText("signed-out:none")).toBeInTheDocument();
    expect(client.getCurrentProfile).not.toHaveBeenCalled();
  });

  it("reports disabled and loading authentication states without profile requests", async () => {
    const disabledClient = createCloudApiClientMock();
    const { unmount } = renderProfile(disabledClient, undefined, false);
    expect(await screen.findByText("disabled:none")).toBeInTheDocument();
    expect(disabledClient.getCurrentProfile).not.toHaveBeenCalled();
    unmount();

    clerkMock.isLoaded = false;
    const loadingClient = createCloudApiClientMock();
    renderProfile(loadingClient);
    expect(await screen.findByText("loading:none")).toBeInTheDocument();
    expect(loadingClient.getCurrentProfile).not.toHaveBeenCalled();
  });

  it("bootstraps a stable User Handle from the setup panel", async () => {
    const user = userEvent.setup();
    const client = createCloudApiClientMock({
      bootstrapProfile: vi.fn().mockResolvedValue(profile),
      getCurrentProfile: vi
        .fn()
        .mockRejectedValue(new CloudApiError(404, "Create a profile.", "profile_not_initialized")),
    });

    renderProfile(client, <ProfileBootstrapPanel />);

    await user.type(await screen.findByLabelText("User Handle"), "Test-Cook");
    await user.click(screen.getByRole("button", { name: "Reserve handle" }));

    await waitFor(() => expect(screen.getByText("ready:test-cook")).toBeInTheDocument());
    expect(client.bootstrapProfile).toHaveBeenCalledWith({ username: "test-cook" });
  });

  it("retries a failed profile lookup", async () => {
    const user = userEvent.setup();
    const client = createCloudApiClientMock({
      getCurrentProfile: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(profile),
    });

    renderProfile(client, <ProfileBootstrapPanel />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ready:test-cook")).toBeInTheDocument();
    expect(client.getCurrentProfile).toHaveBeenCalledTimes(2);
  });

  it("keeps profile creation errors in the setup panel", async () => {
    const user = userEvent.setup();
    const client = createCloudApiClientMock({
      bootstrapProfile: vi.fn().mockRejectedValue(new Error("Handle unavailable.")),
      getCurrentProfile: vi
        .fn()
        .mockRejectedValue(new CloudApiError(404, "Create a profile.", "profile_not_initialized")),
    });
    renderProfile(client, <ProfileBootstrapPanel />);

    await user.type(await screen.findByLabelText("User Handle"), "test-cook");
    await user.click(screen.getByRole("button", { name: "Reserve handle" }));

    expect(await screen.findByText("Handle unavailable.")).toBeInTheDocument();
  });

  it("rejects profile creation while signed out", async () => {
    const user = userEvent.setup();
    clerkMock.isSignedIn = false;
    renderProfile(createCloudApiClientMock(), <BootstrapProbe />);

    await user.click(await screen.findByRole("button", { name: "Bootstrap probe" }));
    expect(await screen.findByText("Sign in before creating a profile.")).toBeInTheDocument();
  });
});

function renderProfile(
  client: ReturnType<typeof createCloudApiClientMock>,
  child?: ReactNode,
  cloudEnabled = true,
) {
  return render(
    <AuthProvider cloudApiBaseUrl={cloudEnabled ? "/api" : undefined} clerkPublishableKey="pk_test">
      <CloudApiProvider client={client}>
        <CloudProfileProvider>
          <ProfileProbe />
          {child}
        </CloudProfileProvider>
      </CloudApiProvider>
    </AuthProvider>,
  );
}

function ProfileProbe() {
  const profile = useCloudProfile();
  return <span>{`${profile.status}:${profile.profile?.username ?? "none"}`}</span>;
}

function BootstrapProbe() {
  const profile = useCloudProfile();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          profile.bootstrapProfile({ username: "test-cook" }).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : "unknown");
          })
        }
      >
        Bootstrap probe
      </button>
      <span>{error}</span>
    </>
  );
}
