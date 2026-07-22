import { BaseStyles, ThemeProvider } from "@primer/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ensureSeedData } from "../db/seedData";
import { EolDashboardPage } from "../features/audit/EolDashboardPage";
import { SecurityPage } from "../features/audit/SecurityPage";
import { BackupPage } from "../features/backup/BackupPage";
import { InventoryPage } from "../features/inventory/InventoryPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { DashboardPage } from "../features/recipes/DashboardPage";
import { RecipeDetailPage } from "../features/recipes/RecipeDetailPage";
import { RecipeEditorPage } from "../features/recipes/RecipeEditorPage";
import { AppLink } from "../ui/components/Link";
import {
  AlertIcon,
  AppMarkIcon,
  ArchiveIcon,
  PackageIcon,
  RepoIcon,
  ShieldIcon,
} from "../ui/components/TemporaryIcons";
import { useCloudApi } from "./providers/CloudApiProvider";
import { useRepositories } from "./providers/RepositoryProvider";
import { useRoute } from "./routes";
import "./layout/styles.css";

export function App() {
  const route = useRoute();
  const cloudApi = useCloudApi();
  const repositories = useRepositories();
  const [seedError, setSeedError] = useState<string | null>(null);
  const routeUsesCloudData = cloudApi !== null && route.name === "profile";

  useEffect(() => {
    if (routeUsesCloudData) {
      setSeedError(null);
      return;
    }

    ensureSeedData(repositories).catch((error: unknown) => {
      setSeedError(error instanceof Error ? error.message : "Seed data failed to initialize.");
    });
  }, [repositories, routeUsesCloudData]);

  return (
    <ThemeProvider colorMode="auto">
      <BaseStyles>
        <div className="app-shell">
          <header className="app-header">
            <AppLink className="app-brand" to="/">
              <AppMarkIcon size={24} />
              <span>SeasoningBOM</span>
            </AppLink>
            <nav className="app-nav" aria-label="Primary">
              <NavItem active={route.name === "dashboard"} to="/" icon={<RepoIcon />}>
                Repositories
              </NavItem>
              <NavItem active={route.name === "inventory"} to="/inventory" icon={<PackageIcon />}>
                Inventory
              </NavItem>
              <NavItem active={route.name === "security"} to="/security" icon={<ShieldIcon />}>
                Security
              </NavItem>
              <NavItem active={route.name === "eol"} to="/eol" icon={<AlertIcon />}>
                EOL
              </NavItem>
              <NavItem active={route.name === "backup"} to="/backup" icon={<ArchiveIcon />}>
                Backup
              </NavItem>
            </nav>
          </header>
          <main className="app-main">
            {seedError ? <div className="flash flash-danger">{seedError}</div> : null}
            {route.name === "dashboard" ? <DashboardPage /> : null}
            {route.name === "repository" ? (
              <RecipeDetailPage ownerHandle={route.ownerHandle} slug={route.slug} />
            ) : null}
            {route.name === "repository-edit" ? (
              <RecipeEditorPage ownerHandle={route.ownerHandle} slug={route.slug} />
            ) : null}
            {route.name === "inventory" ? <InventoryPage /> : null}
            {route.name === "security" ? <SecurityPage /> : null}
            {route.name === "eol" ? <EolDashboardPage /> : null}
            {route.name === "backup" ? <BackupPage /> : null}
            {route.name === "profile" ? <ProfilePage username={route.username} /> : null}
            {route.name === "not-found" ? (
              <div className="empty-state">
                <strong>Route not found</strong>
                <p>{route.path}</p>
              </div>
            ) : null}
          </main>
        </div>
      </BaseStyles>
    </ThemeProvider>
  );
}

function NavItem({
  active,
  to,
  icon,
  children,
}: {
  active: boolean;
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppLink aria-current={active ? "page" : undefined} to={to}>
      {icon}
      {children}
    </AppLink>
  );
}
