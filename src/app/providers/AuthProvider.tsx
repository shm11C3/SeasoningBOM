import { ClerkProvider, Show, SignInButton, UserButton, useAuth } from "@clerk/react";
import { Button } from "@primer/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";

export type AppAuthStatus = "disabled" | "misconfigured" | "loading" | "signed-out" | "signed-in";

type AppAuth = {
  getToken: () => Promise<string | null>;
  status: AppAuthStatus;
};

const noSessionToken = async () => null;
const disabledAuth: AppAuth = { getToken: noSessionToken, status: "disabled" };
const misconfiguredAuth: AppAuth = { getToken: noSessionToken, status: "misconfigured" };
const AppAuthContext = createContext<AppAuth>(disabledAuth);

export function AuthProvider({
  children,
  cloudApiBaseUrl = import.meta.env.VITE_SEASONINGBOM_API_BASE_URL,
  clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
}: {
  children: ReactNode;
  cloudApiBaseUrl?: string;
  clerkPublishableKey?: string;
}) {
  if (!cloudApiBaseUrl?.trim()) {
    return <AppAuthContext.Provider value={disabledAuth}>{children}</AppAuthContext.Provider>;
  }

  if (!clerkPublishableKey?.trim()) {
    return <AppAuthContext.Provider value={misconfiguredAuth}>{children}</AppAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getSessionToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      return null;
    }
    return getToken();
  }, [getToken, isLoaded, isSignedIn]);
  const value = useMemo<AppAuth>(
    () => ({
      getToken: getSessionToken,
      status: !isLoaded ? "loading" : isSignedIn ? "signed-in" : "signed-out",
    }),
    [getSessionToken, isLoaded, isSignedIn],
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function AuthControls() {
  const auth = useAppAuth();

  if (auth.status === "disabled") {
    return null;
  }
  if (auth.status === "misconfigured") {
    return <span className="auth-status">Sign in unavailable</span>;
  }
  if (auth.status === "loading") {
    return <span className="auth-status">Loading account...</span>;
  }

  return (
    <div className="auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button type="button">Sign in</Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}

export function useAppAuth(): AppAuth {
  return useContext(AppAuthContext);
}
