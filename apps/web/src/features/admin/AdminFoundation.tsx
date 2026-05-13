import { Bell, Building2, CalendarClock, FileClock, LayoutDashboard, ShieldCheck, Tags, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { AdminAuditPage } from "./audit/AdminAuditPage";
import { CatalogAdminPage } from "./catalog/CatalogAdminPage";
import { EntitiesAdminPage } from "./entities/EntitiesAdminPage";
import { AdminOverviewPage, type AdminOverviewItem } from "./overview/AdminOverviewPage";
import { RolesAdminPage } from "./roles/RolesAdminPage";
import { TenderTypeDaysAdminPage } from "./tender-type-days/TenderTypeDaysAdminPage";
import { AdminUsersPage } from "./users/AdminUsersPage";
import { OperationsWorkspace } from "../operations/pages/OperationsWorkspace";
import { useAuth } from "../../shared/auth/AuthProvider";
import {
  canAccessAdminWorkspace,
  canManageNotifications,
  canManageRoles,
  canManageUsers,
  canReadAudit,
  canReadCatalog,
  canReadEntities,
  canReadUsers,
} from "../../shared/auth/permissions";
import { navigateToAppPath, useAppLocation } from "../../shared/routing/appLocation";
import { AccessDeniedState, NotFoundState } from "../../shared/ui/app-states/AppStates";
import { SecondaryNav } from "../../shared/ui/secondary-nav/SecondaryNav";

type AdminSectionKey = "audit" | "catalog" | "entities" | "operations" | "overview" | "roles" | "tender-rules" | "users";

type AdminSectionDefinition = AdminOverviewItem & {
  icon: LucideIcon;
  key: AdminSectionKey;
  path: string;
};

const adminSectionPaths: Record<AdminSectionKey, string> = {
  audit: "/admin/audit-logs",
  catalog: "/admin/choice-lists",
  entities: "/admin/entities",
  operations: "/admin/operations",
  overview: "/admin/overview",
  roles: "/admin/roles",
  "tender-rules": "/admin/tender-types",
  users: "/admin/users",
};

const legacyDepartmentsPath = "/admin/departments";

export function AdminFoundation() {
  const { user } = useAuth();
  const location = useAppLocation();
  const hasUserAccess = canReadUsers(user) || canManageUsers(user);
  const hasRoleAccess = canManageRoles(user);
  const hasEntityAccess = canReadEntities(user);
  const hasCatalogAccess = canReadCatalog(user);
  const hasAuditAccess = canReadAudit(user);
  const hasOperationsAccess = canReadAudit(user) || canManageNotifications(user);
  const hasAdminAccess = canAccessAdminWorkspace(user);
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
    if (hasUserAccess) {
      items.push({
        group: "Access",
        description: "Manage users, roles, entity scope, and password policy.",
        icon: UsersRound,
        key: "users",
        label: "Users & Security",
        path: adminSectionPaths.users,
      });
    }
    if (hasRoleAccess) {
      items.push({
        group: "Access",
        description: "Create tenant roles and manage permission bundles.",
        icon: ShieldCheck,
        key: "roles",
        label: "Roles",
        path: adminSectionPaths.roles,
      });
    }
    if (hasEntityAccess) {
      items.push({
        group: "Organization",
        description: "Manage tenant entities and their departments.",
        icon: Building2,
        key: "entities",
        label: "Entities & Departments",
        path: adminSectionPaths.entities,
      });
    }
    if (hasCatalogAccess) {
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
    if (hasAuditAccess) {
      items.push({
        group: "Governance",
        description: "Review tenant audit events, actors, IPs, and event details.",
        icon: FileClock,
        key: "audit",
        label: "Audit Logs",
        path: adminSectionPaths.audit,
      });
    }
    if (hasOperationsAccess) {
      items.push({
        group: "Governance",
        description: "Manage notification rules, previews, queue jobs, and failed events.",
        icon: Bell,
        key: "operations",
        label: "Operations",
        path: adminSectionPaths.operations,
      });
    }
    return items;
  }, [hasAuditAccess, hasCatalogAccess, hasEntityAccess, hasOperationsAccess, hasRoleAccess, hasUserAccess]);

  const requestedSection = adminSectionFromPath(location.pathname);
  const isRootAdminPath = location.pathname === "/admin";
  const isLegacyDepartmentsPath = location.pathname === legacyDepartmentsPath;
  const firstSection = sections[0];
  const activeSection = isLegacyDepartmentsPath ? "entities" : requestedSection ?? firstSection?.key ?? "overview";
  const activeSectionAllowed = sections.some((section) => section.key === activeSection);
  const departmentFocusEntityId = new URLSearchParams(location.search).get("entityId") ?? "";

  useEffect(() => {
    if (isRootAdminPath && firstSection) {
      navigateToAppPath(firstSection.path, { replace: true });
    }
  }, [firstSection, isRootAdminPath]);

  useEffect(() => {
    if (isLegacyDepartmentsPath) {
      navigateToAppPath(`${adminSectionPaths.entities}${location.search}`, { replace: true });
    }
  }, [isLegacyDepartmentsPath, location.search]);

  if (!hasAdminAccess || (!hasUserAccess && !hasRoleAccess && !hasEntityAccess && !hasCatalogAccess && !hasAuditAccess && !hasOperationsAccess)) {
    return <AccessDeniedState />;
  }

  if (!requestedSection && !isRootAdminPath && !isLegacyDepartmentsPath) {
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
        {renderAdminSection(activeSection, sections, openSection, departmentFocusEntityId)}
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
    return <EntitiesAdminPage focusEntityId={departmentFocusEntityId} />;
  }
  if (section === "catalog") return <CatalogAdminPage />;
  if (section === "tender-rules") return <TenderTypeDaysAdminPage />;
  if (section === "operations") return <OperationsWorkspace />;
  return <AdminAuditPage />;
}

function adminSectionFromPath(pathname: string): AdminSectionKey | null {
  if (pathname === "/operations/audit-logs" || pathname === "/admin/operations/audit-logs") return "audit";
  if (pathname === "/operations" || pathname.startsWith("/operations/")) return "operations";
  if (pathname === "/admin/operations" || pathname.startsWith("/admin/operations/")) return "operations";
  return (
    (Object.entries(adminSectionPaths).find(([, path]) => path === pathname)?.[0] as AdminSectionKey | undefined) ??
    null
  );
}
