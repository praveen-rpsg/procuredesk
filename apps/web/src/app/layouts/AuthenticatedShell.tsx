import {
  Activity,
  ArchiveRestore,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CircleAlert,
  FileText,
  FileClock,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ShieldCheck,
  Tags,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { useAuth, type CurrentUser } from "../../shared/auth/AuthProvider";
import {
  canAccessWorkspace,
  canExportReports,
  canManageNotifications,
  canManageRoles,
  canManageUsers,
  canReadAudit,
  canReadCatalog,
  canReadEntities,
  canReadUsers,
  canRestoreCase,
  type Permission,
  type WorkspaceKey,
} from "../../shared/auth/permissions";
import {
  navigateToAppPath,
  useAppLocation,
} from "../../shared/routing/appLocation";
import {
  AccessDeniedState,
  NotFoundState,
} from "../../shared/ui/app-states/AppStates";
import { Drawer } from "../../shared/ui/drawer/Drawer";
import { Skeleton } from "../../shared/ui/skeleton/Skeleton";
import { DashboardPage } from "../../features/dashboard/pages/DashboardPage";
import { ImportExportWorkspace } from "../../features/import-export/pages/ImportExportWorkspace";
import { PlanningWorkspace } from "../../features/planning/pages/PlanningWorkspace";
import { ProfileDrawer } from "../../features/profile/components/ProfileDrawer";
import { CasesWorkspace } from "../../features/procurement-cases/pages/CasesWorkspace";
import { REPORT_OPTIONS } from "../../features/reporting/utils/reportUtils";

const AdminFoundation = lazy(() =>
  import("../../features/admin/AdminFoundation").then((module) => ({
    default: module.AdminFoundation,
  })),
);
const ReportsWorkspace = lazy(() =>
  import("../../features/reporting/pages/ReportsWorkspace").then((module) => ({
    default: module.ReportsWorkspace,
  })),
);

type RouteWorkspace = WorkspaceKey | "not-found";
type DashboardTarget =
  | "all-cases"
  | "assigned-cases"
  | "completed-cases"
  | "delayed-cases"
  | "imports"
  | "new-case"
  | "off-track-cases"
  | "on-track-cases"
  | "planning"
  | "priority-cases"
  | "reports"
  | "running-cases"
  | "update-case";
type SidebarSubNavigationItem = {
  icon?: LucideIcon;
  isActive?: (pathname: string) => boolean;
  key: string;
  label: string;
  path: string;
  visible?: (user: CurrentUser | null) => boolean;
};

const navigation = [
  { key: "cases", label: "Cases", icon: FileText, path: "/cases" },
  { key: "planning", label: "Planning", icon: Activity, path: "/planning" },
  { key: "reports", label: "Reports", icon: BarChart3, path: "/reports" },
  { key: "imports", label: "Imports", icon: UploadCloud, path: "/imports" },
  { key: "admin", label: "Admin", icon: Building2, path: "/admin/overview" },
] satisfies Array<{
  icon: LucideIcon;
  key: WorkspaceKey;
  label: string;
  path: string;
  permissions?: Permission[];
}>;

const reportSidebarSubNavigation: SidebarSubNavigationItem[] =
  REPORT_OPTIONS.map((option): SidebarSubNavigationItem => {
    const item = {
      icon: option.icon,
      key: option.code,
      label: option.label,
      path: option.path,
    };

    if (option.code === "export_jobs") {
      return { ...item, visible: canExportReports };
    }

    return item;
  });

const sidebarSubNavigation: Partial<
  Record<WorkspaceKey, SidebarSubNavigationItem[]>
> = {
  admin: [
    {
      icon: LayoutDashboard,
      key: "overview",
      label: "Overview",
      path: "/admin/overview",
    },
    {
      icon: UsersRound,
      key: "users",
      label: "Users",
      path: "/admin/users",
      visible: (user) => canReadUsers(user) || canManageUsers(user),
    },
    {
      icon: ShieldCheck,
      key: "roles",
      label: "Roles",
      path: "/admin/roles",
      visible: canManageRoles,
    },
    {
      icon: Building2,
      key: "entities",
      label: "Entities",
      path: "/admin/entities",
      visible: canReadEntities,
    },
    {
      icon: Tags,
      key: "catalog",
      label: "Catalog",
      path: "/admin/choice-lists",
      visible: canReadCatalog,
    },
    {
      icon: CalendarClock,
      key: "tender-rules",
      label: "Tender Rules",
      path: "/admin/tender-types",
      visible: canReadCatalog,
    },
    {
      icon: FileClock,
      key: "audit",
      label: "Audit Logs",
      path: "/admin/audit-logs",
      visible: canReadAudit,
    },
    {
      icon: Bell,
      key: "operations",
      label: "Operations",
      path: "/admin/operations",
      isActive: (pathname) =>
        pathnameMatchesPath(pathname, "/admin/operations") ||
        pathnameMatchesPath(pathname, "/operations"),
      visible: (user) => canReadAudit(user) || canManageNotifications(user),
    },
  ],
  cases: [
    {
      icon: FileText,
      key: "active",
      label: "Active Cases",
      path: "/cases",
      isActive: (pathname) =>
        pathname === "/cases" ||
        (pathname.startsWith("/cases/") &&
          !pathnameMatchesPath(pathname, "/cases/recovery")),
    },
    {
      icon: ArchiveRestore,
      key: "recovery",
      label: "Recovery",
      path: "/cases/recovery",
      visible: canRestoreCase,
    },
  ],
  imports: [
    {
      icon: UploadCloud,
      key: "upload",
      label: "Upload",
      path: "/imports/upload",
      isActive: (pathname) =>
        pathname === "/imports" ||
        pathnameMatchesPath(pathname, "/imports/upload"),
    },
    {
      icon: ListChecks,
      key: "jobs",
      label: "Import Jobs",
      path: "/imports/jobs",
    },
  ],
  planning: [
    {
      icon: CalendarClock,
      key: "tender-plans",
      label: "Tender Plans",
      path: "/planning/tender-plans",
      isActive: (pathname) =>
        pathname === "/planning" ||
        pathnameMatchesPath(pathname, "/planning/tender-plans"),
    },
    {
      icon: CircleAlert,
      key: "rc-po-expiry",
      label: "RC/PO Expiry",
      path: "/reports/rc-po-expiry",
    },
  ],
  reports: reportSidebarSubNavigation,
};

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
  onDashboardNavigate: (target: DashboardTarget) => void,
  user: CurrentUser | null,
) => {
  if (workspace === "not-found") return <NotFoundState />;
  if (!canAccessWorkspace(user, workspace)) return <AccessDeniedState />;

  switch (workspace) {
    case "admin":
      return renderLazyWorkspace(<AdminFoundation />);
    case "cases":
      return <CasesWorkspace />;
    case "imports":
      return <ImportExportWorkspace />;
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

const sidebarSubNavItemClassName = (isActive: boolean) =>
  `sidebar-subnav-item ${isActive ? "sidebar-subnav-item-active" : ""}`.trim();

const drawerSubNavItemClassName = (isActive: boolean) =>
  `drawer-subnav-item ${isActive ? "drawer-subnav-item-active" : ""}`.trim();

function pathnameMatchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isSidebarSubNavigationActive(
  pathname: string,
  item: SidebarSubNavigationItem,
) {
  return item.isActive?.(pathname) ?? pathnameMatchesPath(pathname, item.path);
}

function visibleSidebarSubNavigationItems(
  workspace: WorkspaceKey,
  user: CurrentUser | null,
) {
  return (sidebarSubNavigation[workspace] ?? []).filter(
    (item) => item.visible?.(user) ?? true,
  );
}

function SidebarSubNavigationLink({
  className,
  isActive,
  item,
  onClick,
}: {
  className: string;
  isActive: boolean;
  item: SidebarSubNavigationItem;
  onClick: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const Icon = item.icon;

  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={className}
      href={item.path}
      onClick={(event) => onClick(event, item.path)}
    >
      {Icon ? (
        <span aria-hidden="true" className="sidebar-subnav-icon">
          <Icon size={13} />
        </span>
      ) : null}
      <span className="sidebar-subnav-label">{item.label}</span>
    </a>
  );
}

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPref);
  const activeTitle =
    activeWorkspace === "not-found"
      ? "Page Not Found"
      : workspaceTitles[activeWorkspace];
  const visibleNavigation = navigation.filter((item) =>
    canAccessWorkspace(user, item.key),
  );
  const hasVisibleNavigation = visibleNavigation.length > 0;
  const defaultNavigationPath = canAccessWorkspace(user, "dashboard")
    ? "/dashboard"
    : (visibleNavigation[0]?.path ?? "/dashboard");
  const canUseActiveWorkspace =
    activeWorkspace !== "not-found" &&
    canAccessWorkspace(user, activeWorkspace);
  const userInitial =
    user?.fullName?.[0]?.toUpperCase() ??
    user?.username?.[0]?.toUpperCase() ??
    "?";

  useEffect(() => {
    if (
      location.pathname === "/" ||
      (hasVisibleNavigation &&
        activeWorkspace !== "not-found" &&
        !canUseActiveWorkspace)
    ) {
      navigateToAppPath(defaultNavigationPath, {
        replace: true,
      });
    }
  }, [
    activeWorkspace,
    canUseActiveWorkspace,
    defaultNavigationPath,
    hasVisibleNavigation,
    location.pathname,
  ]);

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
    if (target === "all-cases") {
      navigateToAppPath("/cases");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "assigned-cases") {
      navigateToAppPath("/cases?view=assigned");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "running-cases") {
      navigateToAppPath("/cases?status=running");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "completed-cases") {
      navigateToAppPath("/cases?status=completed");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "delayed-cases") {
      navigateToAppPath("/cases?trackStatus=delayed");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "off-track-cases") {
      navigateToAppPath("/cases?trackStatus=off_track");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "on-track-cases") {
      navigateToAppPath("/cases?trackStatus=on_track");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "priority-cases") {
      navigateToAppPath("/cases?status=running&priorityCase=true");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "new-case") {
      navigateToAppPath("/cases?action=new");
      setIsMobileNavOpen(false);
      return;
    }
    if (target === "update-case") {
      navigateToAppPath("/cases");
      setIsMobileNavOpen(false);
      return;
    }
    selectWorkspace(target);
  };

  const onNavigationClick = (
    event: MouseEvent<HTMLAnchorElement>,
    workspace: WorkspaceKey,
  ) => {
    event.preventDefault();
    selectWorkspace(workspace);
  };

  const onSubNavigationClick = (
    event: MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    event.preventDefault();
    navigateToAppPath(path);
    setIsMobileNavOpen(false);
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
          href={defaultNavigationPath}
          onClick={(e) => {
            e.preventDefault();
            navigateToAppPath(defaultNavigationPath);
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
          {visibleNavigation.map((item) => {
            const subNavigationItems = visibleSidebarSubNavigationItems(
              item.key,
              user,
            );
            const isActiveWorkspace = activeWorkspace === item.key;

            return (
              <div className="nav-group" key={item.key}>
                <a
                  aria-current={isActiveWorkspace ? "page" : undefined}
                  className={navItemClassName(isActiveWorkspace)}
                  data-label={item.label}
                  href={item.path}
                  onClick={(event) => onNavigationClick(event, item.key)}
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </a>
                {!isCollapsed &&
                isActiveWorkspace &&
                subNavigationItems.length ? (
                  <nav
                    aria-label={`${item.label} sections`}
                    className="sidebar-subnav"
                  >
                    {subNavigationItems.map((subItem) => {
                      const isActive = isSidebarSubNavigationActive(
                        location.pathname,
                        subItem,
                      );

                      return (
                        <SidebarSubNavigationLink
                          className={sidebarSubNavItemClassName(isActive)}
                          isActive={isActive}
                          item={subItem}
                          key={subItem.key}
                          onClick={onSubNavigationClick}
                        />
                      );
                    })}
                  </nav>
                ) : null}
                {isCollapsed && subNavigationItems.length ? (
                  <div
                    aria-label={`${item.label} sections`}
                    className="sidebar-subnav-flyout"
                    role="group"
                  >
                    <div className="sidebar-subnav-flyout-title">
                      {item.label}
                    </div>
                    <div className="sidebar-subnav-flyout-list">
                      {subNavigationItems.map((subItem) => {
                        const isActive = isSidebarSubNavigationActive(
                          location.pathname,
                          subItem,
                        );

                        return (
                          <SidebarSubNavigationLink
                            className={sidebarSubNavItemClassName(isActive)}
                            isActive={isActive}
                            item={subItem}
                            key={subItem.key}
                            onClick={onSubNavigationClick}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
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
          {isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
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
            <Pencil
              aria-hidden="true"
              className="sidebar-user-edit-icon"
              size={14}
            />
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
      <Drawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        title="Navigation"
      >
        <div className="drawer-nav-content">
          <nav
            aria-label="Mobile navigation"
            className="nav-list nav-list-drawer"
          >
            {visibleNavigation.map((item) => {
              const subNavigationItems = visibleSidebarSubNavigationItems(
                item.key,
                user,
              );
              const isActiveWorkspace = activeWorkspace === item.key;

              return (
                <div className="nav-drawer-group" key={item.key}>
                  <a
                    aria-current={isActiveWorkspace ? "page" : undefined}
                    className={drawerNavItemClassName(isActiveWorkspace)}
                    href={item.path}
                    onClick={(event) => onNavigationClick(event, item.key)}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </a>
                  {isActiveWorkspace && subNavigationItems.length ? (
                    <nav
                      aria-label={`${item.label} sections`}
                      className="drawer-subnav"
                    >
                      {subNavigationItems.map((subItem) => {
                        const isActive = isSidebarSubNavigationActive(
                          location.pathname,
                          subItem,
                        );

                        return (
                          <SidebarSubNavigationLink
                            className={drawerSubNavItemClassName(isActive)}
                            isActive={isActive}
                            item={subItem}
                            key={subItem.key}
                            onClick={onSubNavigationClick}
                          />
                        );
                      })}
                    </nav>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <div className="drawer-user-footer">
            <button
              className="drawer-user-info drawer-profile-button"
              onClick={() => setIsProfileOpen(true)}
              type="button"
            >
              <div className="sidebar-user-avatar" aria-hidden="true">
                {userInitial}
              </div>
              <div className="sidebar-user-info">
                <strong>{user?.fullName}</strong>
                <span>{user?.email}</span>
              </div>
              <Pencil
                aria-hidden="true"
                className="sidebar-user-edit-icon"
                size={14}
              />
            </button>
            <button
              className="sidebar-logout drawer-logout"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </Drawer>

      <ProfileDrawer
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

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

        {renderWorkspace(activeWorkspace, handleDashboardNavigate, user)}
      </section>
    </main>
  );
}

function workspaceFromPath(pathname: string): RouteWorkspace {
  if (pathname === "/" || pathname === "/dashboard") return "dashboard";
  if (pathname === "/cases" || pathname.startsWith("/cases/")) return "cases";
  if (pathname === "/planning" || pathname.startsWith("/planning/"))
    return "planning";
  if (pathname === "/reports" || pathname.startsWith("/reports/"))
    return "reports";
  if (pathname === "/imports" || pathname.startsWith("/imports/"))
    return "imports";
  if (pathname === "/operations" || pathname.startsWith("/operations/"))
    return "admin";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return "not-found";
}
