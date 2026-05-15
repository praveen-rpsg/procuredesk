import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  createAdminRole,
  deleteAdminRole,
  listAdminPermissions,
  listAdminRoles,
  updateAdminRole,
  type AdminPermission,
  type AdminRole,
} from "../api/adminApi";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type RoleDraft = {
  code: string;
  description: string;
  name: string;
  permissionCodes: string[];
};

const emptyDraft: RoleDraft = {
  code: "",
  description: "",
  name: "",
  permissionCodes: [],
};

export function RolesAdminPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const roles = useQuery({
    queryFn: listAdminRoles,
    queryKey: ["admin-roles"],
  });
  const permissions = useQuery({
    queryFn: listAdminPermissions,
    queryKey: ["admin-permissions"],
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<AdminRole | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const groupedPermissions = useMemo(
    () => groupPermissions(permissions.data ?? []),
    [permissions.data],
  );

  const createMutation = useMutation({
    mutationFn: () => createAdminRole(toRolePayload(draft)),
    onSuccess: async () => {
      setIsCreateOpen(false);
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      notify({ message: "Role created.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingRole) return Promise.resolve();
      return updateAdminRole(editingRole.id, toRolePayload(draft));
    },
    onSuccess: async () => {
      setEditingRole(null);
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      notify({ message: "Role saved.", tone: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminRole(deleteRole?.id ?? ""),
    onSuccess: async () => {
      setDeleteRole(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      notify({ message: "Role deleted.", tone: "success" });
    },
  });

  const openCreate = () => {
    setDraft(emptyDraft);
    setIsCreateOpen(true);
  };

  const openEdit = (role: AdminRole) => {
    setEditingRole(role);
    setDraft({
      code: role.code,
      description: role.description ?? "",
      name: role.name,
      permissionCodes: role.permissionCodes,
    });
  };

  const openClone = (role: AdminRole) => {
    setDraft({
      code: `${role.code}_copy`.replace(/[^a-z0-9_]/g, "_"),
      description: role.description ?? "",
      name: `${formatRoleName(role)} Copy`,
      permissionCodes: role.permissionCodes,
    });
    setIsCreateOpen(true);
  };

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const onUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateMutation.mutate();
  };

  return (
    <section className="admin-section">
      <PageHeader
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} />
            New Role
          </Button>
        }
        eyebrow="Admin"
        title="Roles & Permissions"
      >
        Manage tenant roles, permission bundles, and assignment-safe access
        levels.
      </PageHeader>

      <div className="admin-stack">
        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Access Control</p>
              <h2>Role Directory</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <ShieldCheck size={16} />
            </div>
          </div>
          {roles.isLoading ? (
            <div className="role-card-grid">
              {[1, 2, 3].map((item) => (
                <Skeleton height={150} key={item} />
              ))}
            </div>
          ) : roles.error ? (
            <p className="inline-error">{roles.error.message}</p>
          ) : (
            <div className="role-card-grid">
              {(roles.data ?? []).map((role) => (
                <article className="role-card" key={role.id}>
                  <div className="role-card-header">
                    <div>
                      <div className="role-card-title-row">
                        <h3>{formatRoleName(role)}</h3>
                        <StatusBadge
                          tone={role.isSystemRole ? "neutral" : "success"}
                        >
                          {role.isSystemRole ? "System" : "Tenant"}
                        </StatusBadge>
                      </div>
                      <code>{role.code}</code>
                    </div>
                    <div className="row-actions">
                      <IconButton
                        aria-label={`Clone ${formatRoleName(role)}`}
                        onClick={() => openClone(role)}
                        tooltip="Clone role"
                      >
                        <Copy size={16} />
                      </IconButton>
                      <IconButton
                        aria-label={`Edit ${formatRoleName(role)}`}
                        disabled={role.isSystemRole}
                        onClick={() => openEdit(role)}
                        tooltip={
                          role.isSystemRole
                            ? "Clone system roles to customize permissions"
                            : "Edit role"
                        }
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${formatRoleName(role)}`}
                        disabled={role.isSystemRole || role.userCount > 0}
                        onClick={() => setDeleteRole(role)}
                        tooltip={
                          role.isSystemRole
                            ? "System roles cannot be deleted"
                            : role.userCount > 0
                              ? "Remove this role from users before deleting"
                              : "Delete role"
                        }
                        variant="danger"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>
                  <p>{role.description ?? "No description provided."}</p>
                  <div className="role-card-meta">
                    <span>{role.permissionCodes.length} permissions</span>
                    <span>{role.userCount} users</span>
                  </div>
                  <div className="role-permission-preview">
                    {role.permissionCodes.slice(0, 8).map((permission) => (
                      <span key={permission}>{permission}</span>
                    ))}
                    {role.permissionCodes.length > 8 ? (
                      <span>+{role.permissionCodes.length - 8}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        size="wide"
        title="New Role"
      >
        <form className="stack-form" onSubmit={onCreate}>
          <RoleForm
            groupedPermissions={groupedPermissions}
            isCodeEditable
            isLoadingPermissions={permissions.isLoading}
            onChange={setDraft}
            value={draft}
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              onClick={() => setIsCreateOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              Create Role
            </Button>
          </div>
        </form>
        {createMutation.error ? (
          <p className="inline-error">{createMutation.error.message}</p>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(editingRole)}
        onClose={() => setEditingRole(null)}
        size="wide"
        title="Edit Role"
      >
        <form className="stack-form" onSubmit={onUpdate}>
          <RoleForm
            groupedPermissions={groupedPermissions}
            isCodeEditable={false}
            isLoadingPermissions={permissions.isLoading}
            onChange={setDraft}
            value={draft}
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              onClick={() => setEditingRole(null)}
              type="button"
            >
              Cancel
            </Button>
            <Button disabled={updateMutation.isPending} type="submit">
              Save Role
            </Button>
          </div>
        </form>
        {updateMutation.error ? (
          <p className="inline-error">{updateMutation.error.message}</p>
        ) : null}
      </Modal>

      <ConfirmationDialog
        confirmLabel="Delete Role"
        description={
          deleteRole
            ? `Delete ${formatRoleName(deleteRole)}? This cannot be undone.`
            : "Delete this role?"
        }
        isOpen={Boolean(deleteRole)}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteRole(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Role"
        tone="danger"
      >
        {deleteMutation.error ? (
          <p className="inline-error">{deleteMutation.error.message}</p>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}

function RoleForm({
  groupedPermissions,
  isCodeEditable,
  isLoadingPermissions,
  onChange,
  value,
}: {
  groupedPermissions: Array<{ group: string; permissions: AdminPermission[] }>;
  isCodeEditable: boolean;
  isLoadingPermissions: boolean;
  onChange: (value: RoleDraft) => void;
  value: RoleDraft;
}) {
  const [permissionQuery, setPermissionQuery] = useState("");
  const selected = new Set(value.permissionCodes);
  const normalizedQuery = permissionQuery.trim().toLowerCase();
  const visibleGroups = groupedPermissions
    .map((group) => ({
      ...group,
      permissions: normalizedQuery
        ? group.permissions.filter((permission) =>
            [
              permission.name,
              permission.code,
              permission.description ?? "",
            ].some((text) => text.toLowerCase().includes(normalizedQuery)),
          )
        : group.permissions,
    }))
    .filter((group) => group.permissions.length > 0);
  const togglePermission = (code: string) => {
    onChange({
      ...value,
      permissionCodes: selected.has(code)
        ? value.permissionCodes.filter((permission) => permission !== code)
        : [...value.permissionCodes, code],
    });
  };
  const selectGroup = (permissions: AdminPermission[]) => {
    const nextPermissionCodes = Array.from(
      new Set([
        ...value.permissionCodes,
        ...permissions.map((permission) => permission.code),
      ]),
    );
    onChange({ ...value, permissionCodes: nextPermissionCodes });
  };
  const clearGroup = (permissions: AdminPermission[]) => {
    const groupCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    onChange({
      ...value,
      permissionCodes: value.permissionCodes.filter(
        (permissionCode) => !groupCodes.has(permissionCode),
      ),
    });
  };

  return (
    <>
      <div className="two-column">
        <FormField
          helperText="Lowercase code used by the system. Cannot be changed later."
          label="Role Code"
        >
          <TextInput
            disabled={!isCodeEditable}
            maxLength={80}
            onChange={(event) =>
              onChange({
                ...value,
                code: event.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_"),
              })
            }
            placeholder="procurement_reviewer"
            required
            value={value.code}
          />
        </FormField>
        <FormField label="Role Name">
          <TextInput
            maxLength={160}
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
            placeholder="Procurement Reviewer"
            required
            value={value.name}
          />
        </FormField>
      </div>
      <FormField label="Description">
        <TextArea
          maxLength={500}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
          placeholder="Explain who should receive this role and what it allows."
          value={value.description}
        />
      </FormField>
      <div className="permission-editor">
        <div className="permission-editor-header">
          <div>
            <p className="eyebrow">Permissions</p>
            <h3>{value.permissionCodes.length} selected</h3>
          </div>
          <Button
            onClick={() =>
              onChange({
                ...value,
                permissionCodes:
                  value.permissionCodes.length > 0
                    ? []
                    : groupedPermissions.flatMap((group) =>
                        group.permissions.map((permission) => permission.code),
                      ),
              })
            }
            size="sm"
            type="button"
            variant={value.permissionCodes.length > 0 ? "ghost" : "secondary"}
          >
            {value.permissionCodes.length > 0 ? "Clear" : "Select All"}
          </Button>
        </div>
        <div className="permission-search-control">
          <Search aria-hidden="true" size={16} />
          <TextInput
            aria-label="Search permissions"
            onChange={(event) => setPermissionQuery(event.target.value)}
            placeholder="Search permission name, code, or description"
            value={permissionQuery}
          />
        </div>
        {isLoadingPermissions ? (
          <Skeleton height={160} />
        ) : visibleGroups.length === 0 ? (
          <p className="admin-help-text">
            No permissions match the current search.
          </p>
        ) : (
          <div className="permission-group-grid">
            {visibleGroups.map((group) => {
              const selectedCount = group.permissions.filter((permission) =>
                selected.has(permission.code),
              ).length;
              return (
                <section className="permission-group" key={group.group}>
                  <div className="permission-group-heading">
                    <div>
                      <h4>{group.group}</h4>
                      <span>
                        {selectedCount} of {group.permissions.length} selected
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        onClick={() => selectGroup(group.permissions)}
                        type="button"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => clearGroup(group.permissions)}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {group.permissions.map((permission) => (
                    <label className="permission-row" key={permission.code}>
                      <input
                        checked={selected.has(permission.code)}
                        onChange={() => togglePermission(permission.code)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{permission.name}</strong>
                        <small>{permission.code}</small>
                        {permission.description ? (
                          <em>{permission.description}</em>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function groupPermissions(permissions: AdminPermission[]) {
  const groups = new Map<string, AdminPermission[]>();
  for (const permission of permissions) {
    const group = permission.code.split(".")[0] ?? "other";
    const label = groupLabel(group);
    groups.set(label, [...(groups.get(label) ?? []), permission]);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    permissions: items.sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

function groupLabel(group: string) {
  const labels: Record<string, string> = {
    admin: "Admin Console",
    audit: "Audit",
    award: "Awards",
    case: "Cases",
    catalog: "Catalog",
    entity: "Organization",
    import: "Imports",
    notification: "Notifications",
    permission: "Permissions",
    planning: "Planning",
    report: "Reports",
    role: "Roles",
    system: "System",
    tenant: "Tenant",
    user: "Users",
  };
  return labels[group] ?? "Other";
}

function toRolePayload(value: RoleDraft) {
  return {
    code: value.code,
    description: value.description.trim() || null,
    name: value.name,
    permissionCodes: value.permissionCodes,
  };
}

function formatRoleName(role: Pick<AdminRole, "code" | "name">) {
  if (role.code === "platform_super_admin") return "Super Admin";
  if (role.code === "tenant_admin") return "Administration Manager";
  if (role.code === "group_viewer") return "Group Viewer";
  if (role.code === "entity_viewer") return "Entity Viewer";
  return role.name;
}
