import { Building2, CalendarClock, FileClock, FolderTree, LayoutDashboard, ShieldCheck, Tags, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { AdminAuditPage } from "./audit/AdminAuditPage";
import { CatalogAdminPage } from "./catalog/CatalogAdminPage";
import { DepartmentsAdminPage } from "./departments/DepartmentsAdminPage";
import { EntitiesAdminPage } from "./entities/EntitiesAdminPage";
import { AdminOverviewPage, type AdminOverviewItem } from "./overview/AdminOverviewPage";
import { RolesAdminPage } from "./roles/RolesAdminPage";
import { TenderTypeDaysAdminPage } from "./tender-type-days/TenderTypeDaysAdminPage";
import { AdminUsersPage } from "./users/AdminUsersPage";
import { useAuth } from "../../shared/auth/AuthProvider";
import { navigateToAppPath, useAppLocation } from "../../shared/routing/appLocation";
import { AccessDeniedState, NotFoundState } from "../../shared/ui/app-states/AppStates";
import { SecondaryNav } from "../../shared/ui/secondary-nav/SecondaryNav";

type AdminSectionKey = "audit" | "catalog" | "departments" | "entities" | "overview" | "roles" | "tender-rules" | "users";

type AdminSectionDefinition = AdminOverviewItem & {
  icon: LucideIcon;
  key: AdminSectionKey;
  path: string;
};

const adminSectionPaths: Record<AdminSectionKey, string> = {
  audit: "/admin/audit-logs",
  catalog: "/admin/choice-lists",
  departments: "/admin/departments",
  entities: "/admin/entities",
  overview: "/admin/overview",
  roles: "/admin/roles",
  "tender-rules": "/admin/tender-types",
  users: "/admin/users",
};

export function AdminFoundation() {
  const { user } = useAuth();
  const location = useAppLocation();
  const canManageUsers = can(user, ["role.manage", "user.manage", "user.read"]);
  const canManageRoles = can(user, ["role.manage"]);
  const canManageEntities = can(user, ["entity.manage"]);
  const canManageCatalog = can(user, ["catalog.manage"]);
  const canReadAudit = can(user, ["audit.read"]);
  const sections = useMemo<AdminSectionDefinition[]>(() => {
    const items: AdminSectionDefinition[] = [
      {
        description: "Admin command center and setup health.",
        group: "Overview",
        icon: LayoutDashboard,
        key: "overview",
        label: "Overview",
        path: adminSectionPaths.overview,
      },
    ];
    if (canManageUsers) {
      items.push({
        group: "Access",
        description: "Manage users, roles, entity scope, and password policy.",
        icon: UsersRound,
        key: "users",
        label: "Users & Security",
        path: adminSectionPaths.users,
      });
    }
    if (canManageRoles) {
      items.push({
        group: "Access",
        description: "Create tenant roles and manage permission bundles.",
        icon: ShieldCheck,
        key: "roles",
        label: "Roles",
        path: adminSectionPaths.roles,
      });
    }
    if (canManageEntities) {
      items.push(
        {
          group: "Organization",
          description: "Manage tenant entities.",
          icon: Building2,
          key: "entities",
          label: "Entities",
          path: adminSectionPaths.entities,
        },
        {
          group: "Organization",
          description: "Manage departments under each entity.",
          icon: FolderTree,
          key: "departments",
          label: "Departments",
          path: adminSectionPaths.departments,
        },
      );
    }
    if (canManageCatalog) {
      items.push(
        {
          group: "Configuration",
          description: "Manage procurement reference values.",
          icon: Tags,
          key: "catalog",
          label: "Choice Lists",
          path: adminSectionPaths.catalog,
        },
        {
          group: "Configuration",
          description: "Manage tender types, completion days, and milestone rules.",
          icon: CalendarClock,
          key: "tender-rules",
          label: "Tender Types",
          path: adminSectionPaths["tender-rules"],
        },
      );
    }
    if (canReadAudit) {
      items.push({
        group: "Governance",
        description: "Review tenant audit events, actors, IPs, and event details.",
        icon: FileClock,
        key: "audit",
        label: "Audit Logs",
        path: adminSectionPaths.audit,
      });
    }
    return items;
  }, [canManageCatalog, canManageEntities, canManageRoles, canManageUsers, canReadAudit]);

  const requestedSection = adminSectionFromPath(location.pathname);
  const isRootAdminPath = location.pathname === "/admin";
  const firstSection = sections[0];
  const activeSection = requestedSection ?? firstSection?.key ?? "overview";
  const activeSectionAllowed = sections.some((section) => section.key === activeSection);
  const departmentFocusEntityId = new URLSearchParams(location.search).get("entityId") ?? "";

  useEffect(() => {
    if (isRootAdminPath && firstSection) {
      navigateToAppPath(firstSection.path, { replace: true });
    }
  }, [firstSection, isRootAdminPath]);

  if (!canManageUsers && !canManageEntities && !canManageCatalog && !canReadAudit) {
    return <AccessDeniedState />;
  }

  if (!requestedSection && !isRootAdminPath) {
    return <NotFoundState />;
  }

  if (!activeSectionAllowed) {
    return <AccessDeniedState />;
  }

  const openSection = (section: AdminSectionKey) => {
    const item = sections.find((entry) => entry.key === section);
    if (item) navigateToAppPath(item.path);
  };

  return (
    <section className="admin-workspace admin-workspace-horizontal">
      <section className="module-subnav-shell">
        <SecondaryNav
          activeKey={activeSection}
          ariaLabel="Administration sections"
          items={sections.map((section) => ({
            description: section.description,
            icon: section.icon,
            key: section.key,
            label: section.label,
          }))}
          onChange={openSection}
        />
      </section>
      <div className="admin-section-host">
        {renderAdminSection(
          activeSection,
          sections,
          openSection,
          departmentFocusEntityId,
        )}
      </div>
    </section>
  );
}

function renderAdminSection(
  section: AdminSectionKey,
  sections: AdminSectionDefinition[],
  onOpen: (section: AdminSectionKey) => void,
  departmentFocusEntityId: string,
) {
  if (section === "overview") {
    return (
      <AdminOverviewPage
        items={sections.filter((item) => item.key !== "overview")}
        onOpen={(key) => onOpen(key as AdminSectionKey)}
      />
    );
  }
  if (section === "users") return <AdminUsersPage />;
  if (section === "roles") return <RolesAdminPage />;
  if (section === "entities") {
    return (
      <EntitiesAdminPage
        onManageDepartments={(entityId) => {
          navigateToAppPath(`${adminSectionPaths.departments}?entityId=${encodeURIComponent(entityId)}`);
        }}
      />
    );
  }
  if (section === "departments") {
    return (
      <DepartmentsAdminPage
        focusEntityId={departmentFocusEntityId}
        onEntityScopeChange={(entityId) =>
          navigateToAppPath(`${adminSectionPaths.departments}?entityId=${encodeURIComponent(entityId)}`, {
            replace: true,
          })
        }
      />
    );
  }
  if (section === "catalog") return <CatalogAdminPage />;
  if (section === "tender-rules") return <TenderTypeDaysAdminPage />;
  return <AdminAuditPage />;
}

function can(user: ReturnType<typeof useAuth>["user"], permissions: string[]) {
  return Boolean(user?.isPlatformSuperAdmin || permissions.some((permission) => user?.permissions.includes(permission)));
}

function adminSectionFromPath(pathname: string): AdminSectionKey | null {
  return (
    (Object.entries(adminSectionPaths).find(([, path]) => path === pathname)?.[0] as AdminSectionKey | undefined) ??
    null
  );
}
