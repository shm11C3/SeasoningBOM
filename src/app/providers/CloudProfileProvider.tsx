import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CloudApiError,
  type CloudProfileBootstrapInput,
  type CloudUserProfile,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { useAppAuth } from "./AuthProvider";
import { useCloudApi } from "./CloudApiProvider";

export type CloudProfileStatus =
  | "disabled"
  | "loading"
  | "signed-out"
  | "needs-profile"
  | "ready"
  | "error";

type CloudProfileContextValue = {
  bootstrapProfile: (input: CloudProfileBootstrapInput) => Promise<CloudUserProfile>;
  profile: CloudUserProfile | null;
  refresh: () => void;
  status: CloudProfileStatus;
};

const unavailableBootstrap = async (): Promise<never> => {
  throw new CloudApiError(401, "Sign in before creating a profile.", "not_authenticated");
};

const disabledValue: CloudProfileContextValue = {
  bootstrapProfile: unavailableBootstrap,
  profile: null,
  refresh: () => undefined,
  status: "disabled",
};

const CloudProfileContext = createContext<CloudProfileContextValue>(disabledValue);

export function CloudProfileProvider({ children }: { children: ReactNode }) {
  const api = useCloudApi();
  const auth = useAppAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<{
    profile: CloudUserProfile | null;
    status: CloudProfileStatus;
  }>(disabledValue);

  useEffect(() => {
    // Changing this key intentionally starts a fresh profile request.
    void refreshKey;
    if (!api || auth.status === "disabled" || auth.status === "misconfigured") {
      setState({ profile: null, status: "disabled" });
      return;
    }
    if (auth.status === "loading") {
      setState({ profile: null, status: "loading" });
      return;
    }
    if (auth.status === "signed-out") {
      setState({ profile: null, status: "signed-out" });
      return;
    }

    const controller = new AbortController();
    setState({ profile: null, status: "loading" });
    api.getCurrentProfile(controller.signal).then(
      (profile) => {
        if (!controller.signal.aborted) {
          setState({ profile, status: "ready" });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          profile: null,
          status:
            error instanceof CloudApiError && error.code === "profile_not_initialized"
              ? "needs-profile"
              : "error",
        });
      },
    );

    return () => controller.abort();
  }, [api, auth.status, refreshKey]);

  const bootstrapProfile = useCallback(
    async (input: CloudProfileBootstrapInput) => {
      if (!api || auth.status !== "signed-in") {
        return unavailableBootstrap();
      }
      const profile = await api.bootstrapProfile(input);
      setState({ profile, status: "ready" });
      return profile;
    },
    [api, auth.status],
  );
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);
  const value = useMemo<CloudProfileContextValue>(
    () => ({ bootstrapProfile, profile: state.profile, refresh, status: state.status }),
    [bootstrapProfile, refresh, state],
  );

  return <CloudProfileContext.Provider value={value}>{children}</CloudProfileContext.Provider>;
}

export function useCloudProfile(): CloudProfileContextValue {
  return useContext(CloudProfileContext);
}
