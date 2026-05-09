import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pause, Pencil, Plus, Power, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  createAdminUser,
  getPasswordPolicy,
  listAdminEntities,
  listAdminRoles,
  listAdminUsers,
  replaceAdminUserEntityScopes,
  replaceAdminUserRoles,
  setAdminUserPassword,
  updateAdminUserProfile,
  updateAdminUserStatus,
  updatePasswordPolicy,
  type AdminRole,
  type AdminUser,
  type PasswordPolicy,
} from "../api/adminApi";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type PrimaryRole = "custom" | "entity_manager" | "group_viewer" | "tenant_admin" | "tender_owner";

type EditUserForm = {
  customRoleIds: string[];
  email: string;
  entityIds: string[];
  fullName: string;
  isActive: boolean;
  password: string;
  primaryRole: PrimaryRole;
  username: string;
};

const managedRoleCodes = new Set(["entity_manager", "group_viewer", "tenant_admin", "tender_owner"]);
const primaryRoleOptions: Array<{
  code: Exclude<PrimaryRole, "custom">;
  description: string;
  label: string;
}> = [
  { code: "tender_owner", description: "Assigned procurement work with mapped entity context.", label: "Tender Owner" },
  { code: "entity_manager", description: "Manage cases, awards, plans, and reports for selected entities.", label: "Entity Manager" },
  { code: "group_viewer", description: "Tenant-wide read access for cases and reports.", label: "Group Viewer" },
  { code: "tenant_admin", description: "Full tenant administration including users, roles, entities, and imports.", label: "Tenant Admin" },
];

const defaultPolicy: Omit<PasswordPolicy, "tenantId"> = {
  expiryDays: null,
  forcePeriodicExpiry: false,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  minLength: 12,
  passwordHistoryCount: 5,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
  requireUppercase: true,
};

const userColumns = (
  onEdit: (user: AdminUser) => void,
  onToggleStatus: (user: AdminUser) => void,
): DataTableColumn<AdminUser>[] => [
  { key: "username", header: "Username", render: (row) => row.username },
  { key: "name", header: "Full Name", render: (row) => row.fullName },
  { key: "email", header: "Email", render: (row) => row.email },
  {
    key: "access",
    header: "Primary Role",
    render: (row) => <AccessLevelBadge label={derivePrimaryRoleLabel(row)} tone={row.roleCodes.includes("tenant_admin") ? "warning" : "neutral"} />,
  },
  {
    key: "entities",
    header: "Entities",
    render: (row) => formatEntitySummary(row.entityCodes),
  },
  {
    key: "admin",
    header: "Admin",
    render: (row) =>
      row.roleCodes.includes("tenant_admin") || row.isPlatformSuperAdmin ? (
        <StatusBadge tone="success">Yes</StatusBadge>
      ) : (
        "-"
      ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={statusTone(row.status)}>{formatStatus(row.status)}</StatusBadge>,
  },
  {
    key: "action",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <IconButton aria-label={`Edit ${row.fullName}`} onClick={() => onEdit(row)} tooltip="Edit user">
          <Pencil size={17} />
        </IconButton>
        <IconButton
          aria-label={row.status === "active" ? `Deactivate ${row.fullName}` : `Activate ${row.fullName}`}
          onClick={() => onToggleStatus(row)}
          tooltip={row.status === "active" ? "Deactivate user" : "Activate user"}
        >
          {row.status === "active" ? <Pause size={17} /> : <Power size={17} />}
        </IconButton>
      </div>
    ),
  },
];

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AdminUser | null>(null);
  const [newUser, setNewUser] = useState<EditUserForm>({ ...emptyEditUserForm, isActive: true });
  const [editUser, setEditUser] = useState<EditUserForm>(emptyEditUserForm);
  const [policy, setPolicy] = useState<Omit<PasswordPolicy, "tenantId">>(defaultPolicy);

  const users = useQuery({ queryFn: listAdminUsers, queryKey: ["admin-users"] });
  const roles = useQuery({ queryFn: listAdminRoles, queryKey: ["admin-roles"] });
  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["admin-entities"] });
  const passwordPolicy = useQuery({ queryFn: getPasswordPolicy, queryKey: ["password-policy"] });

  useEffect(() => {
    if (passwordPolicy.data) {
      const { tenantId: _tenantId, ...rest } = passwordPolicy.data;
      setPolicy(rest);
    }
  }, [passwordPolicy.data]);

  const entityOptions = useMemo(
    () =>
      (entities.data ?? []).map((entity) => ({
        label: `${entity.code} - ${entity.name}`,
        value: entity.id,
      })),
    [entities.data],
  );

  const createUserMutation = useMutation({
    mutationFn: () =>
      createAdminUser({
        email: newUser.email,
        entityIds: roleSelectionNeedsEntityScope(newUser, roles.data ?? []) ? newUser.entityIds : [],
        fullName: newUser.fullName,
        password: newUser.password,
        roleIds: buildRoleIds(roles.data ?? [], newUser),
        status: newUser.isActive ? "active" : "inactive",
        username: newUser.username,
      }),
    onSuccess: async () => {
      setIsCreateOpen(false);
      setNewUser({ ...emptyEditUserForm, isActive: true });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      notify({ message: "User created.", tone: "success" });
    },
  });

  const quickStatusMutation = useMutation({
    mutationFn: (input: { status: AdminUser["status"]; userId: string }) =>
      updateAdminUserStatus(input.userId, input.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      notify({ message: "User status updated.", tone: "success" });
    },
  });

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (!userToEdit) return;
      await updateAdminUserProfile(userToEdit.id, {
        email: editUser.email,
        fullName: editUser.fullName,
        username: editUser.username,
      });
      await replaceAdminUserEntityScopes(
        userToEdit.id,
        roleSelectionNeedsEntityScope(editUser, roles.data ?? []) ? editUser.entityIds : [],
      );
      await replaceAdminUserRoles(
        userToEdit.id,
        buildRoleIds(roles.data ?? [], editUser),
      );
      if (editUser.password.trim()) {
        await setAdminUserPassword(userToEdit.id, editUser.password);
      }
      await updateAdminUserStatus(userToEdit.id, resolveSavedStatus(userToEdit.status, editUser));
    },
    onSuccess: async () => {
      setUserToEdit(null);
      setEditUser(emptyEditUserForm);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      notify({ message: "User saved.", tone: "success" });
    },
  });

  const policyMutation = useMutation({
    mutationFn: () => updatePasswordPolicy(policy),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["password-policy"] });
      notify({ message: "Password policy saved.", tone: "success" });
    },
  });

  const onCreateUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createUserMutation.mutate();
  };

  const onSaveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveUserMutation.mutate();
  };

  const openEdit = (user: AdminUser) => {
    setUserToEdit(user);
    setEditUser({
      customRoleIds: user.roleIds.filter((roleId) => {
        const role = roles.data?.find((item) => item.id === roleId);
        return role ? isAdditionalAssignableRole(role) : false;
      }),
      email: user.email,
      entityIds: user.entityIds,
      fullName: user.fullName,
      isActive: user.status === "active",
      password: "",
      primaryRole: derivePrimaryRole(user),
      username: user.username,
    });
  };

  return (
    <section className="admin-section admin-grid-wide">
      <PageHeader
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} />
            New User
          </Button>
        }
        eyebrow="Admin"
        title="Users & Roles"
      >
        Manage user identity, access level, mapped entities, admin rights, and password policy.
      </PageHeader>

      <section className="admin-stack">
        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Users</p>
              <h2>User Directory</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <UsersRound size={16} />
            </div>
          </div>
          {users.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="12%" />
                  <Skeleton height={13} width="18%" />
                  <Skeleton height={13} width="22%" />
                  <Skeleton height={13} width="10%" />
                  <Skeleton height={13} width="14%" />
                </div>
              ))}
            </div>
          ) : users.error ? (
            <p className="inline-error">{users.error.message}</p>
          ) : (
            <DataTable
              columns={userColumns(openEdit, (user) =>
                quickStatusMutation.mutate({
                  status: user.status === "active" ? "inactive" : "active",
                  userId: user.id,
                }),
              )}
              emptyMessage="No users found."
              getRowKey={(row) => row.id}
              rows={users.data ?? []}
            />
          )}
          <p className="admin-help-text">
            Primary roles control the main access path. Custom roles are selected only when a user needs a
            configured permission bundle outside the standard templates.
          </p>
        </section>

        <section className="state-panel admin-grid-wide">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Security</p>
              <h2>Password Policy</h2>
            </div>
          </div>
          <div className="password-policy-grid">
            <FormField label="Minimum Length">
              <TextInput
                min={8}
                onChange={(event) => setPolicy((value) => ({ ...value, minLength: Number(event.target.value) }))}
                type="number"
                value={policy.minLength}
              />
            </FormField>
            <FormField label="History Count">
              <TextInput
                min={0}
                onChange={(event) => setPolicy((value) => ({ ...value, passwordHistoryCount: Number(event.target.value) }))}
                type="number"
                value={policy.passwordHistoryCount}
              />
            </FormField>
            <FormField label="Lockout Attempts">
              <TextInput
                min={3}
                onChange={(event) => setPolicy((value) => ({ ...value, lockoutAttempts: Number(event.target.value) }))}
                type="number"
                value={policy.lockoutAttempts}
              />
            </FormField>
            <FormField label="Lockout Minutes">
              <TextInput
                min={1}
                onChange={(event) => setPolicy((value) => ({ ...value, lockoutMinutes: Number(event.target.value) }))}
                type="number"
                value={policy.lockoutMinutes}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={policy.requireUppercase}
                onChange={(event) => setPolicy((value) => ({ ...value, requireUppercase: event.target.checked }))}
                type="checkbox"
              />
              Uppercase
            </label>
            <label className="checkbox-row">
              <input
                checked={policy.requireLowercase}
                onChange={(event) => setPolicy((value) => ({ ...value, requireLowercase: event.target.checked }))}
                type="checkbox"
              />
              Lowercase
            </label>
            <label className="checkbox-row">
              <input
                checked={policy.requireNumber}
                onChange={(event) => setPolicy((value) => ({ ...value, requireNumber: event.target.checked }))}
                type="checkbox"
              />
              Number
            </label>
            <label className="checkbox-row">
              <input
                checked={policy.requireSpecialCharacter}
                onChange={(event) => setPolicy((value) => ({ ...value, requireSpecialCharacter: event.target.checked }))}
                type="checkbox"
              />
              Special Character
            </label>
            <label className="checkbox-row">
              <input
                checked={policy.forcePeriodicExpiry}
                onChange={(event) => setPolicy((value) => ({ ...value, forcePeriodicExpiry: event.target.checked }))}
                type="checkbox"
              />
              Periodic Expiry
            </label>
            <FormField label="Expiry Days">
              <TextInput
                min={1}
                onChange={(event) =>
                  setPolicy((value) => ({ ...value, expiryDays: event.target.value ? Number(event.target.value) : null }))
                }
                type="number"
                value={policy.expiryDays ?? ""}
              />
            </FormField>
            <Button disabled={policyMutation.isPending} onClick={() => policyMutation.mutate()}>
              Save Policy
            </Button>
          </div>
          {policyMutation.error ? <p className="inline-error">{policyMutation.error.message}</p> : null}
        </section>
      </section>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} size="wide" title="New User">
        <form className="stack-form" onSubmit={onCreateUser}>
          <UserAccessForm
            entityOptions={entityOptions}
            isNewUser
            onChange={setNewUser}
            roleOptions={additionalRoleOptions(roles.data ?? [])}
            roles={roles.data ?? []}
            value={newUser}
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createUserMutation.isPending} type="submit">
              Create User
            </Button>
          </div>
        </form>
        {createUserMutation.error ? <p className="inline-error">{createUserMutation.error.message}</p> : null}
      </Modal>

      <Modal isOpen={Boolean(userToEdit)} onClose={() => setUserToEdit(null)} size="wide" title="Edit User">
        <form className="stack-form" onSubmit={onSaveUser}>
          <UserAccessForm
            entityOptions={entityOptions}
            onChange={setEditUser}
            roleOptions={additionalRoleOptions(roles.data ?? [])}
            roles={roles.data ?? []}
            value={editUser}
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setUserToEdit(null)} type="button">
              Cancel
            </Button>
            <Button disabled={saveUserMutation.isPending} type="submit">
              Save User
            </Button>
          </div>
        </form>
        {saveUserMutation.error ? <p className="inline-error">{saveUserMutation.error.message}</p> : null}
      </Modal>
    </section>
  );
}

const emptyEditUserForm: EditUserForm = {
  customRoleIds: [],
  email: "",
  entityIds: [],
  fullName: "",
  isActive: false,
  password: "",
  primaryRole: "tender_owner",
  username: "",
};

function derivePrimaryRole(user: AdminUser): PrimaryRole {
  if (user.roleCodes.includes("tenant_admin")) return "tenant_admin";
  if (user.roleCodes.includes("group_viewer")) return "group_viewer";
  if (user.roleCodes.includes("entity_manager")) return "entity_manager";
  if (user.roleCodes.includes("tender_owner")) return "tender_owner";
  return "custom";
}

function derivePrimaryRoleLabel(user: AdminUser) {
  const primaryRole = derivePrimaryRole(user);
  if (primaryRole === "custom") return "Custom";
  return primaryRoleOptions.find((option) => option.code === primaryRole)?.label ?? primaryRole;
}

function buildRoleIds(roles: AdminRole[], value: EditUserForm) {
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const nextRoleIds: string[] = [];
  if (value.primaryRole === "custom") {
    for (const roleId of value.customRoleIds) {
      const role = roleById.get(roleId);
      if (role && isAdditionalAssignableRole(role)) nextRoleIds.push(roleId);
    }
  } else {
    const role = roleByCode.get(value.primaryRole);
    if (role) nextRoleIds.push(role.id);
  }
  if (value.primaryRole !== "custom") {
    for (const roleId of value.customRoleIds) {
      const role = roleById.get(roleId);
      if (role && isAdditionalAssignableRole(role)) nextRoleIds.push(roleId);
    }
  }
  return Array.from(new Set(nextRoleIds));
}

function roleSelectionNeedsEntityScope(value: EditUserForm, roles: AdminRole[]) {
  return roles
    .filter((role) => buildRoleIds(roles, value).includes(role.id))
    .some(roleNeedsEntityScope);
}

function roleNeedsEntityScope(role: AdminRole) {
  return role.permissionCodes.some((permission) =>
    ["case.create", "case.delay.manage.entity", "case.read.entity", "case.update.entity", "planning.manage"].includes(permission),
  );
}

type UserAccessFormProps = {
  entityOptions: Array<{ label: string; value: string }>;
  isNewUser?: boolean;
  onChange: Dispatch<SetStateAction<EditUserForm>>;
  roleOptions: Array<{ description: string; label: string; value: string }>;
  roles: AdminRole[];
  value: EditUserForm;
};

function UserAccessForm({ entityOptions, isNewUser = false, onChange, roleOptions, roles, value }: UserAccessFormProps) {
  const effectiveRoleIds = buildRoleIds(roles, value);
  const effectiveRoles = roles.filter((role) => effectiveRoleIds.includes(role.id));
  const effectivePermissions = Array.from(new Set(effectiveRoles.flatMap((role) => role.permissionCodes))).sort();
  const riskyPermissions = effectivePermissions.filter(isRiskyPermission);
  const needsEntityScope = roleSelectionNeedsEntityScope(value, roles);
  const toggleEntity = (entityId: string) => {
    onChange((currentValue) => {
      if (currentValue.entityIds.includes(entityId)) {
        return {
          ...currentValue,
          entityIds: currentValue.entityIds.filter((currentEntityId) => currentEntityId !== entityId),
        };
      }
      return { ...currentValue, entityIds: [...currentValue.entityIds, entityId] };
    });
  };
  const toggleRole = (roleId: string) => {
    onChange((currentValue) => {
      if (currentValue.customRoleIds.includes(roleId)) {
        return { ...currentValue, customRoleIds: currentValue.customRoleIds.filter((id) => id !== roleId) };
      }
      return { ...currentValue, customRoleIds: [...currentValue.customRoleIds, roleId] };
    });
  };

  return (
    <>
      <div className="user-edit-grid">
        <FormField label="Username">
          <TextInput
            onChange={(event) => onChange((currentValue) => ({ ...currentValue, username: event.target.value }))}
            required
            value={value.username}
          />
        </FormField>
        <FormField label="Full Name">
          <TextInput
            onChange={(event) => onChange((currentValue) => ({ ...currentValue, fullName: event.target.value }))}
            required
            value={value.fullName}
          />
        </FormField>
        <FormField label="Email">
          <TextInput
            onChange={(event) => onChange((currentValue) => ({ ...currentValue, email: event.target.value }))}
            required
            type="email"
            value={value.email}
          />
        </FormField>
        <FormField helperText={isNewUser ? undefined : "Leave blank to keep current password."} label="Password">
          <TextInput
            onChange={(event) => onChange((currentValue) => ({ ...currentValue, password: event.target.value }))}
            placeholder={isNewUser ? "" : "Leave blank to keep current"}
            required={isNewUser}
            type="password"
            value={value.password}
          />
        </FormField>
        <div className="user-edit-checks">
          <label className="checkbox-row">
            <input
              checked={value.isActive}
              onChange={(event) => onChange((currentValue) => ({ ...currentValue, isActive: event.target.checked }))}
              type="checkbox"
            />
            Active
          </label>
        </div>
      </div>

      <section className="user-role-section">
        <div className="user-role-section-heading">
          <div>
            <p className="eyebrow">Access Role</p>
            <h3>Choose how this user works in ProcureDesk</h3>
          </div>
        </div>
        <div className="user-role-card-grid">
          {primaryRoleOptions.map((option) => (
            <button
              className={`user-role-card ${value.primaryRole === option.code ? "user-role-card-selected" : ""}`.trim()}
              key={option.code}
              onClick={() =>
                onChange((currentValue) => ({
                  ...currentValue,
                  customRoleIds: currentValue.primaryRole === "custom" ? [] : currentValue.customRoleIds,
                  primaryRole: option.code,
                }))
              }
              type="button"
            >
              <span className="user-role-card-icon">
                {value.primaryRole === option.code ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
              </span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
          <button
            className={`user-role-card ${value.primaryRole === "custom" ? "user-role-card-selected" : ""}`.trim()}
            onClick={() => onChange((currentValue) => ({ ...currentValue, primaryRole: "custom" }))}
            type="button"
          >
            <span className="user-role-card-icon">
              {value.primaryRole === "custom" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
            </span>
            <strong>Custom Role</strong>
            <small>Choose one or more configured tenant role bundles.</small>
          </button>
        </div>
      </section>

      {value.primaryRole === "custom" ? (
        <section className="mapped-entity-section">
          <div>
            <strong>Custom Roles</strong>
            <span>Select configured roles from Admin &gt; Roles.</span>
          </div>
          <div className="mapped-entity-grid">
            {roleOptions.map((role) => (
              <label className="mapped-entity-option" key={role.value}>
                <input checked={value.customRoleIds.includes(role.value)} onChange={() => toggleRole(role.value)} type="checkbox" />
                <span>
                  {role.label}
                  {role.description ? <small>{role.description}</small> : null}
                </span>
              </label>
            ))}
          </div>
          {roleOptions.length === 0 ? <p className="admin-help-text">No custom roles are available yet.</p> : null}
        </section>
      ) : roleOptions.length > 0 ? (
        <section className="mapped-entity-section">
          <div>
            <strong>Optional Role Add-ons</strong>
            <span>Add a configured permission bundle only when the primary role is not enough.</span>
          </div>
          <div className="mapped-entity-grid">
            {roleOptions.map((role) => (
              <label className="mapped-entity-option" key={role.value}>
                <input checked={value.customRoleIds.includes(role.value)} onChange={() => toggleRole(role.value)} type="checkbox" />
                <span>
                  {role.label}
                  {role.description ? <small>{role.description}</small> : null}
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mapped-entity-section">
        <div>
          <strong>Mapped Entities</strong>
          <span>{needsEntityScope ? "Required for this role selection." : "Not required for tenant-wide access."}</span>
        </div>
        <div className={`mapped-entity-grid ${!needsEntityScope ? "mapped-entity-grid-disabled" : ""}`.trim()}>
          {entityOptions.map((entity) => (
            <label className="mapped-entity-option" key={entity.value}>
              <input
                checked={value.entityIds.includes(entity.value)}
                disabled={!needsEntityScope}
                onChange={() => toggleEntity(entity.value)}
                type="checkbox"
              />
              <span>{entity.label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="access-preview-panel">
        <div className="access-preview-header">
          <div>
            <p className="eyebrow">Effective Access</p>
            <h3>{effectiveRoles.length} roles · {effectivePermissions.length} permissions</h3>
          </div>
          <StatusBadge tone={riskyPermissions.length > 0 ? "warning" : "success"}>
            {riskyPermissions.length > 0 ? "Review" : "Standard"}
          </StatusBadge>
        </div>
        <div className="access-preview-grid">
          <div>
            <strong>Roles</strong>
            <p>{effectiveRoles.map((role) => role.name).join(", ") || "-"}</p>
          </div>
          <div>
            <strong>Entity Scope</strong>
            <p>{needsEntityScope ? `${value.entityIds.length} mapped entities` : "Tenant-wide or unrestricted by entity"}</p>
          </div>
          <div>
            <strong>Risk Signals</strong>
            <p>{riskyPermissions.length ? riskyPermissions.join(", ") : "No high-risk permissions selected"}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function additionalRoleOptions(roles: AdminRole[]) {
  return roles.filter(isAdditionalAssignableRole).map((role) => ({
    description: role.description ?? `${role.permissionCodes.length} permissions`,
    label: role.name,
    value: role.id,
  }));
}

function isAdditionalAssignableRole(role: AdminRole) {
  return !managedRoleCodes.has(role.code) && role.code !== "platform_super_admin";
}

function isRiskyPermission(permission: string) {
  return [
    "case.delete",
    "case.restore",
    "case.update.all",
    "import.manage",
    "role.manage",
    "tenant.manage",
    "user.manage",
  ].includes(permission);
}

function resolveSavedStatus(currentStatus: AdminUser["status"], editUser: EditUserForm): AdminUser["status"] {
  if (editUser.isActive) return "active";
  if (currentStatus === "pending_password_setup" && !editUser.password.trim()) return "pending_password_setup";
  return "inactive";
}

function formatEntitySummary(entityCodes: string[]) {
  if (entityCodes.length === 0) return "-";
  const visibleCodes = entityCodes.slice(0, 2).join(", ");
  const remainingCount = entityCodes.length - 2;
  return remainingCount > 0 ? `${visibleCodes} +${remainingCount}` : visibleCodes;
}

function formatStatus(status: AdminUser["status"]) {
  if (status === "pending_password_setup") return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: AdminUser["status"]) {
  if (status === "active") return "success";
  if (status === "locked") return "danger";
  if (status === "pending_password_setup") return "warning";
  return "neutral";
}

function AccessLevelBadge({ label, tone = "neutral" }: { label: string; tone?: "danger" | "neutral" | "success" | "warning" }) {
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
