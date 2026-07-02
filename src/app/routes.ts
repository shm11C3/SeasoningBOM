import { useEffect, useMemo, useState } from "react";

export type AppRoute =
  | { name: "dashboard" }
  | { name: "repository"; slug: string }
  | { name: "repository-edit"; slug: string }
  | { name: "inventory" }
  | { name: "security" }
  | { name: "eol" }
  | { name: "backup" }
  | { name: "not-found"; path: string };

export function useRoute(): AppRoute {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return useMemo(() => parseRoute(path), [path]);
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function href(path: string): string {
  return path;
}

function parseRoute(path: string): AppRoute {
  if (path === "/") {
    return { name: "dashboard" };
  }
  if (path === "/inventory") {
    return { name: "inventory" };
  }
  if (path === "/security") {
    return { name: "security" };
  }
  if (path === "/eol") {
    return { name: "eol" };
  }
  if (path === "/backup") {
    return { name: "backup" };
  }

  const repositoryEditMatch = path.match(/^\/repositories\/([^/]+)\/edit$/);
  if (repositoryEditMatch) {
    return { name: "repository-edit", slug: decodeURIComponent(repositoryEditMatch[1]) };
  }

  const repositoryMatch = path.match(/^\/repositories\/([^/]+)$/);
  if (repositoryMatch) {
    return { name: "repository", slug: decodeURIComponent(repositoryMatch[1]) };
  }

  return { name: "not-found", path };
}
