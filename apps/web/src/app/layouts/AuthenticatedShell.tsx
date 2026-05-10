import {
  Activity,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { useAuth, type CurrentUser } from "../../shared/auth/AuthProvider";
import { canAccessWorkspace, type Permission, type WorkspaceKey } from "../../shared/auth/permissions";
import { navigateToAppPath, useAppLocation } from "../../shared/routing/appLocation";
import { AccessDeniedState, NotFoundState } from "../../shared/ui/app-states/AppStates";
import { Drawer } from "../../shared/ui/drawer/Drawer";
import { Skeleton } from "../../shared/ui/skeleton/Skeleton";
import { DashboardPage } from "../../features/dashboard/pages/DashboardPage";
import { ImportExportWorkspace } from "../../features/import-export/pages/ImportExportWorkspace";
import { OperationsWorkspace } from "../../features/operations/pages/OperationsWorkspace";
import { PlanningWorkspace } from "../../features/planning/pages/PlanningWorkspace";
import { ProfileDrawer } from "../../features/profile/components/ProfileDrawer";
import { CasesWorkspace } from "../../features/procurement-cases/pages/CasesWorkspace";

const AdminFoundation = lazy(() =>
  import("../../features/admin/AdminFoundation").then((module) => ({ default: module.AdminFoundation })),
);
const ReportsWorkspace = lazy(() =>
  import("../../features/reporting/pages/ReportsWorkspace").then((module) => ({ default: module.ReportsWorkspace })),
);

type RouteWorkspace = WorkspaceKey | "not-found";
type DashboardTarget = "assigned-cases" | "imports" | "new-case" | "planning" | "reports";

const navigation = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { key: "cases", label: "Cases", icon: FileText, path: "/cases" },
  { key: "planning", label: "Planning", icon: Activity, path: "/planning" },
  { key: "reports", label: "Reports", icon: BarChart3, path: "/reports" },
  { key: "imports", label: "Imports", icon: UploadCloud, path: "/imports" },
  { key: "operations", label: "Operations", icon: ShieldCheck, path: "/operations" },
  { key: "admin", label: "Admin", icon: Building2, path: "/admin/overview" },
] satisfies Array<{
  icon: LucideIcon;
  key: WorkspaceKey;
  label: string;
  path: string;
  permissions?: Permission[];
}>;

const workspaceTitles: Record<WorkspaceKey, string> = {
  admin: "Administration",
  cases: "Procurement Cases",
  dashboard: "Dashboard",
  imports: "Imports And Exports",
  operations: "Operations",
  planning: "Planning",
  reports: "Reports",
};

const renderWorkspace = (
  workspace: RouteWorkspace,
  assignedToMeSignal: number,
  createCaseSignal: number,
  onDashboardNavigate: (target: DashboardTarget) => void,
  user: CurrentUser | null,
) => {
  if (workspace === "not-found") return <NotFoundState />;
  if (!canAccessWorkspace(user, workspace)) return <AccessDeniedState />;

  switch (workspace) {
    case "admin":
      return renderLazyWorkspace(<AdminFoundation />);
    case "cases":
      return <CasesWorkspace assignedToMeSignal={assignedToMeSignal} createCaseSignal={createCaseSignal} />;
    case "imports":
      return <ImportExportWorkspace />;
    case "operations":
      return <OperationsWorkspace />;
    case "planning":
      return <PlanningWorkspace />;
    case "reports":
      return renderLazyWorkspace(<ReportsWorkspace />);
    case "dashboard":
      return <DashboardPage onNavigate={onDashboardNavigate} />;
    default:
      return <NotFoundState />;
  }
};

const renderLazyWorkspace = (children: ReactNode) => (
  <Suspense
    fallback={
      <section className="state-panel">
        <Skeleton height={20} />
      </section>
    }
  >
    {children}
  </Suspense>
);

const navItemClassName = (isActive: boolean) =>
  `nav-item ${isActive ? "nav-item-active" : ""}`.trim();

const drawerNavItemClassName = (isActive: boolean) =>
  `nav-item nav-item-drawer ${isActive ? "nav-item-active nav-item-drawer-active" : ""}`.trim();

function readCollapsedPref(): boolean {
  try {
    return localStorage.getItem("procuredesk.sidebar.collapsed") === "true";
  } catch {
    return false;
  }
}

export function AuthenticatedShell() {
  const { user, logout } = useAuth();
  const location = useAppLocation();
  const activeWorkspace = workspaceFromPath(location.pathname);
  const [assignedToMeSignal, setAssignedToMeSignal] = useState(0);
  const [createCaseSignal, setCreateCaseSignal] = useState(0);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPref);
  const activeTitle = activeWorkspace === "not-found" ? "Page Not Found" : workspaceTitles[activeWorkspace];
  const visibleNavigation = navigation.filter((item) => canAccessWorkspace(user, item.key));
  const userInitial = user?.fullName?.[0]?.toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? "?";

  useEffect(() => {
    if (location.pathname === "/") {
      navigateToAppPath("/dashboard", { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (activeWorkspace !== "cases") return;
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "assigned") {
      setAssignedToMeSignal((value) => value + 1);
    }
    if (params.get("action") === "new") {
      setCreateCaseSignal((value) => value + 1);
    }
  }, [activeWorkspace, location.search]);

  const selectWorkspace = (workspace: WorkspaceKey) => {
    const item = navigation.find((entry) => entry.key === workspace);
    if (item) navigateToAppPath(item.path);
    setIsMobileNavOpen(false);
  };

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem("procuredesk.sidebar.collapsed", String(next));
    } catch {
      // localStorage may be unavailable in some environments
    }
  };

  const handleDashboardNavigate = (target: DashboardTarget) => {
    if (target === "assigned-cases") {
      navigateToAppPath("/cases?view=assigned");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "new-case") {
      navigateToAppPath("/cases?action=new");
      setIsMobileNavOpen(false);
      return;
    }
    selectWorkspace(target);
  };

  const onNavigationClick = (event: MouseEvent<HTMLAnchorElement>, workspace: WorkspaceKey) => {
    event.preventDefault();
    selectWorkspace(workspace);
  };

  const handleLogout = () => {
    void logout();
  };

  const onSidebarDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    toggleSidebar();
  };

  return (
    <main className={`app-shell${isCollapsed ? " app-shell-collapsed" : ""}`}>
      <aside
        className={`sidebar${isCollapsed ? " sidebar-collapsed" : ""}`}
        onDoubleClick={onSidebarDoubleClick}
      >
        {/* Brand — navigates to dashboard */}
        <a
          className="brand"
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            selectWorkspace("dashboard");
          }}
        >
          <div className="brand-mark">PD</div>
          <div className="brand-text">
            <div className="brand-title">ProcureDesk</div>
            <div className="brand-subtitle">Procurement Workstation</div>
          </div>
        </a>

        {/* Primary navigation */}
        <nav aria-label="Primary navigation" className="nav-list">
          {visibleNavigation.map((item) => (
            <a
              aria-current={activeWorkspace === item.key ? "page" : undefined}
              className={navItemClassName(activeWorkspace === item.key)}
              data-label={item.label}
              href={item.path}
              key={item.key}
              onClick={(event) => onNavigationClick(event, item.key)}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        {/* Push footer to bottom */}
        <div className="sidebar-spacer" />

        {/* Collapse toggle — right edge button */}
        <button
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* User footer */}
        <div className="sidebar-footer">
          <button
            aria-label="Edit profile"
            className="sidebar-user"
            onClick={() => setIsProfileOpen(true)}
            title={isCollapsed ? "Edit profile" : undefined}
            type="button"
          >
            <div aria-hidden="true" className="sidebar-user-avatar">
              {userInitial}
            </div>
            <div className="sidebar-user-info">
              <strong>{user?.fullName}</strong>
              <span>{user?.email}</span>
            </div>
            <Pencil aria-hidden="true" className="sidebar-user-edit-icon" size={14} />
          </button>
          <button
            aria-label="Log out"
            className="sidebar-logout"
            onClick={handleLogout}
            title={isCollapsed ? "Log out" : undefined}
            type="button"
          >
            <LogOut size={15} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      <Drawer isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} title="Navigation">
        <div className="drawer-nav-content">
          <nav aria-label="Mobile navigation" className="nav-list nav-list-drawer">
            {visibleNavigation.map((item) => (
              <a
                aria-current={activeWorkspace === item.key ? "page" : undefined}
                className={drawerNavItemClassName(activeWorkspace === item.key)}
                href={item.path}
                key={item.key}
                onClick={(event) => onNavigationClick(event, item.key)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="drawer-user-footer">
            <button className="drawer-user-info drawer-profile-button" onClick={() => setIsProfileOpen(true)} type="button">
              <div className="sidebar-user-avatar" aria-hidden="true">{userInitial}</div>
              <div className="sidebar-user-info">
                <strong>{user?.fullName}</strong>
                <span>{user?.email}</span>
              </div>
              <Pencil aria-hidden="true" className="sidebar-user-edit-icon" size={14} />
            </button>
            <button className="sidebar-logout drawer-logout" onClick={handleLogout} type="button">
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </Drawer>

      <ProfileDrawer isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Main workspace */}
      <section className="workspace">
        {/* Mobile-only topbar */}
        <div className="workspace-mobile-bar">
          <button
            aria-label="Open navigation"
            className="sidebar-mobile-toggle"
            onClick={() => setIsMobileNavOpen(true)}
            type="button"
          >
            <Menu size={18} />
          </button>
          <span className="workspace-mobile-title">{activeTitle}</span>
        </div>

        {renderWorkspace(activeWorkspace, assignedToMeSignal, createCaseSignal, handleDashboardNavigate, user)}
      </section>
    </main>
  );
}

function workspaceFromPath(pathname: string): RouteWorkspace {
  if (pathname === "/" || pathname === "/dashboard") return "dashboard";
  if (pathname === "/cases" || pathname.startsWith("/cases/")) return "cases";
  if (pathname === "/planning" || pathname.startsWith("/planning/")) return "planning";
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return "reports";
  if (pathname === "/imports" || pathname.startsWith("/imports/")) return "imports";
  if (pathname === "/operations" || pathname.startsWith("/operations/")) return "operations";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return "not-found";
}
