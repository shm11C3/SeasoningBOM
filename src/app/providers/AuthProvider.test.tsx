import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthControls, AuthProvider, useAppAuth } from "./AuthProvider";

const clerkMock = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  isLoaded: true,
  isSignedIn: false,
  publishableKey: undefined as string | undefined,
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({
    children,
    publishableKey,
  }: {
    children: ReactNode;
    publishableKey: string;
  }) => {
    clerkMock.publishableKey = publishableKey;
    return <div data-testid="clerk-provider">{children}</div>;
  },
  Show: ({ children, when }: { children: ReactNode; when: "signed-in" | "signed-out" }) => {
    const visible = when === "signed-in" ? clerkMock.isSignedIn : !clerkMock.isSignedIn;
    return visible ? children : null;
  },
  SignInButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => <span>Clerk user menu</span>,
  useAuth: () => clerkMock,
}));

describe("AuthProvider", () => {
  beforeEach(() => {
    clerkMock.getToken.mockReset();
    clerkMock.getToken.mockResolvedValue("session-token");
    clerkMock.isLoaded = true;
    clerkMock.isSignedIn = false;
    clerkMock.publishableKey = undefined;
  });

  it("keeps auth disabled for the local prototype", () => {
    renderAuth({ cloudApiBaseUrl: undefined, clerkPublishableKey: undefined });

    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.queryByTestId("clerk-provider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("keeps public Cloud pages available when Clerk is not configured", () => {
    renderAuth({ cloudApiBaseUrl: "/api", clerkPublishableKey: undefined });

    expect(screen.getByText("misconfigured")).toBeInTheDocument();
    expect(screen.getByText("Sign in unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("clerk-provider")).not.toBeInTheDocument();
  });

  it("renders the Clerk loading and signed-out states", () => {
    clerkMock.isLoaded = false;
    const { rerender } = renderAuth({
      cloudApiBaseUrl: "/api",
      clerkPublishableKey: "  pk_test  ",
    });
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.getByText("Loading account...")).toBeInTheDocument();
    expect(clerkMock.publishableKey).toBe("pk_test");

    clerkMock.isLoaded = true;
    rerender(
      <AuthProvider cloudApiBaseUrl="/api" clerkPublishableKey="pk_test">
        <AuthProbe />
        <AuthControls />
      </AuthProvider>,
    );
    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the Clerk user menu and exposes its session token", async () => {
    clerkMock.isSignedIn = true;
    renderAuth({ cloudApiBaseUrl: "/api", clerkPublishableKey: "pk_test" });

    expect(screen.getByText("signed-in")).toBeInTheDocument();
    expect(screen.getByText("Clerk user menu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Read token" }));
    expect(await screen.findByText("session-token")).toBeInTheDocument();
    expect(clerkMock.getToken).toHaveBeenCalledOnce();
  });

  it("does not request a session token until Clerk is signed in", async () => {
    renderAuth({ cloudApiBaseUrl: "/api", clerkPublishableKey: "pk_test" });

    await userEvent.click(screen.getByRole("button", { name: "Read token" }));
    expect(await screen.findByText("no-token")).toBeInTheDocument();
    expect(clerkMock.getToken).not.toHaveBeenCalled();
  });
});

function renderAuth({
  clerkPublishableKey,
  cloudApiBaseUrl,
}: {
  clerkPublishableKey?: string;
  cloudApiBaseUrl?: string;
}) {
  return render(
    <AuthProvider cloudApiBaseUrl={cloudApiBaseUrl} clerkPublishableKey={clerkPublishableKey}>
      <AuthProbe />
      <AuthControls />
    </AuthProvider>,
  );
}

function AuthProbe() {
  const auth = useAppAuth();
  const [token, setToken] = useState<string | null>();
  return (
    <div>
      <span>{auth.status}</span>
      <button type="button" onClick={async () => setToken((await auth.getToken()) ?? "no-token")}>
        Read token
      </button>
      {token ? <span>{token}</span> : null}
    </div>
  );
}
