import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Pause,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import {
  createAdminUser,
  getPasswordPolicy,
  listAdminEntities,
  listAdminRoles,
  listAdminUsers,
  replaceAdminUserEntityScopes,
  replaceAdminUserRoles,
  setAdminUserPassword,
  updateAdminUserAccessLevel,
  updateAdminUserProfile,
  updateAdminUserStatus,
  updatePasswordPolicy,
  type AdminRole,
  type AdminUser,
  type PasswordPolicy,
} from "../api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canManageRoles,
  canManageUsers,
  canReadEntities,
} from "../../../shared/auth/permissions";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Select } from "../../../shared/ui/form/Select";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type AccessLevel = "ENTITY" | "GROUP" | "USER";

type EditUserForm = {
  customRoleIds: string[];
  email: string;
  entityIds: string[];
  fullName: string;
  isAdmin: boolean;
  isActive: boolean;
  password: string;
  primaryRoleId: string;
  accessLevel: AccessLevel;
  username: string;
};

const accessRoleCodeByLevel: Record<AccessLevel, string> = {
  ENTITY: "entity_manager",
  GROUP: "group_manager",
  USER: "tender_owner",
};

const administrationRoleCodes = ["administration_manager", "tenant_admin"];

const accessLevelOptions: Array<{
  code: AccessLevel;
  description: string;
  label: string;
  name: string;
}> = [
  {
    code: "USER",
    description: "Only tenders directly assigned to this user.",
    label: "User scope",
    name: "Assigned tenders",
  },
  {
    code: "ENTITY",
    description: "All tenders for the mapped entities selected below.",
    label: "Entity scope",
    name: "Mapped entities",
  },
  {
    code: "GROUP",
    description: "All tenders across every entity in the tenant.",
    label: "Group scope",
    name: "All entities",
  },
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
  canManage: boolean,
): DataTableColumn<AdminUser>[] => [
  { key: "username", header: "Username", render: (row) => row.username },
  { key: "name", header: "Full Name", render: (row) => row.fullName },
  { key: "email", header: "Email", render: (row) => row.email },
  {
    key: "access",
    header: "Access Level",
    render: (row) => (
      <AccessLevelBadge
        label={row.accessLevel}
        tone={row.accessLevel === "GROUP" ? "success" : "neutral"}
      />
    ),
  },
  {
    key: "entities",
    header: "Entities",
    render: (row) => formatEntitySummary(row.entityCodes),
  },
  {
    key: "admin",
    header: "Admin Role",
    render: (row) => formatAdminRoleBadge(row),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusBadge tone={statusTone(row.status)}>
        {formatStatus(row.status)}
      </StatusBadge>
    ),
  },
  {
    key: "action",
    header: "Actions",
    render: (row) =>
      canManage ? (
        <div className="row-actions">
          <IconButton
            aria-label={`Edit ${row.fullName}`}
            onClick={() => onEdit(row)}
            tooltip="Edit user"
          >
            <Pencil size={17} />
          </IconButton>
          <IconButton
            aria-label={
              row.status === "active"
                ? `Deactivate ${row.fullName}`
                : `Activate ${row.fullName}`
            }
            onClick={() => onToggleStatus(row)}
            tooltip={
              row.status === "active" ? "Deactivate user" : "Activate user"
            }
          >
            {row.status === "active" ? (
              <Pause size={17} />
            ) : (
              <Power size={17} />
            )}
          </IconButton>
        </div>
      ) : (
        "-"
      ),
  },
];

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManageUserRecords = canManageUsers(user);
  const canEditUserAccess =
    canManageUserRecords && canManageRoles(user) && canReadEntities(user);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AdminUser | null>(null);
  const [newUser, setNewUser] = useState<EditUserForm>({
    ...emptyEditUserForm,
    isActive: true,
  });
  const [editUser, setEditUser] = useState<EditUserForm>(emptyEditUserForm);
  const [policy, setPolicy] =
    useState<Omit<PasswordPolicy, "tenantId">>(defaultPolicy);

  const users = useQuery({
    queryFn: listAdminUsers,
    queryKey: ["admin-users"],
  });
  const roles = useQuery({
    enabled: canEditUserAccess,
    queryFn: listAdminRoles,
    queryKey: ["admin-roles"],
  });
  const entities = useQuery({
    enabled: canEditUserAccess,
    queryFn: listAdminEntities,
    queryKey: ["admin-entities"],
  });
  const passwordPolicy = useQuery({
    enabled: canManageUserRecords,
    queryFn: getPasswordPolicy,
    queryKey: ["password-policy"],
  });

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
        accessLevel: newUser.accessLevel,
        email: newUser.email,
        entityIds: newUser.accessLevel === "GROUP" ? [] : newUser.entityIds,
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
      if (editUser.accessLevel === "GROUP") {
        await updateAdminUserAccessLevel(userToEdit.id, editUser.accessLevel);
        await replaceAdminUserEntityScopes(userToEdit.id, []);
      } else {
        await replaceAdminUserEntityScopes(userToEdit.id, editUser.entityIds);
        await updateAdminUserAccessLevel(userToEdit.id, editUser.accessLevel);
      }
      await replaceAdminUserRoles(
        userToEdit.id,
        buildRoleIds(roles.data ?? [], editUser),
      );
      if (editUser.password.trim()) {
        await setAdminUserPassword(userToEdit.id, editUser.password);
      }
      await updateAdminUserStatus(
        userToEdit.id,
        resolveSavedStatus(userToEdit.status, editUser),
      );
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
    if (!canEditUserAccess) return;
    createUserMutation.mutate();
  };

  const onSaveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditUserAccess) return;
    saveUserMutation.mutate();
  };

  const openEdit = (user: AdminUser) => {
    const isAdmin = hasAdministrationRole(user.roleCodes);
    const primaryRoleId = resolvePrimaryRoleId(roles.data ?? [], user);
    setUserToEdit(user);
    setEditUser({
      customRoleIds: user.roleIds.filter((roleId) => {
        const role = roles.data?.find((item) => item.id === roleId);
        return role
          ? isPrimaryAssignableRole(role) && roleId !== primaryRoleId
          : false;
      }),
      email: user.email,
      entityIds: isAdmin ? [] : user.entityIds,
      fullName: user.fullName,
      isAdmin,
      isActive: user.status === "active",
      password: "",
      primaryRoleId,
      accessLevel: isAdmin ? "GROUP" : user.accessLevel,
      username: user.username,
    });
  };

  return (
    <section className="admin-section admin-grid-wide">
      <PageHeader
        actions={
          canEditUserAccess ? (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus size={16} />
              New User
            </Button>
          ) : null
        }
        eyebrow="Admin"
        title="Users & Roles"
      >
        Manage user identity, access level, mapped entities, administration
        roles, and password policy.
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
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "var(--space-4)",
                    alignItems: "center",
                  }}
                >
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
              columns={userColumns(
                openEdit,
                (row) =>
                  quickStatusMutation.mutate({
                    status: row.status === "active" ? "inactive" : "active",
                    userId: row.id,
                  }),
                canEditUserAccess,
              )}
              emptyMessage="No users found."
              getRowKey={(row) => row.id}
              rows={users.data ?? []}
            />
          )}
          <p className="admin-help-text">
            Access level controls tender visibility. Administration Manager
            grants configuration rights.
          </p>
        </section>

        {canManageUserRecords ? (
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
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      minLength: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={policy.minLength}
                />
              </FormField>
              <FormField label="History Count">
                <TextInput
                  min={0}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      passwordHistoryCount: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={policy.passwordHistoryCount}
                />
              </FormField>
              <FormField label="Lockout Attempts">
                <TextInput
                  min={3}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      lockoutAttempts: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={policy.lockoutAttempts}
                />
              </FormField>
              <FormField label="Lockout Minutes">
                <TextInput
                  min={1}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      lockoutMinutes: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={policy.lockoutMinutes}
                />
              </FormField>
              <label className="checkbox-row">
                <input
                  checked={policy.requireUppercase}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      requireUppercase: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Uppercase
              </label>
              <label className="checkbox-row">
                <input
                  checked={policy.requireLowercase}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      requireLowercase: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Lowercase
              </label>
              <label className="checkbox-row">
                <input
                  checked={policy.requireNumber}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      requireNumber: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Number
              </label>
              <label className="checkbox-row">
                <input
                  checked={policy.requireSpecialCharacter}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      requireSpecialCharacter: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Special Character
              </label>
              <label className="checkbox-row">
                <input
                  checked={policy.forcePeriodicExpiry}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      forcePeriodicExpiry: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Periodic Expiry
              </label>
              <FormField label="Expiry Days">
                <TextInput
                  min={1}
                  onChange={(event) =>
                    setPolicy((value) => ({
                      ...value,
                      expiryDays: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                  type="number"
                  value={policy.expiryDays ?? ""}
                />
              </FormField>
              <Button
                disabled={policyMutation.isPending}
                onClick={() => policyMutation.mutate()}
              >
                Save Policy
              </Button>
            </div>
            {policyMutation.error ? (
              <p className="inline-error">{policyMutation.error.message}</p>
            ) : null}
          </section>
        ) : null}
      </section>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        size="wide"
        title="New User"
      >
        <form className="stack-form" onSubmit={onCreateUser}>
          <UserAccessForm
            entityOptions={entityOptions}
            isNewUser
            onChange={setNewUser}
            roles={roles.data ?? []}
            value={newUser}
          />
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createUserMutation.isPending} type="submit">
              Create User
            </Button>
          </div>
        </form>
        {createUserMutation.error ? (
          <p className="inline-error">{createUserMutation.error.message}</p>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(userToEdit)}
        onClose={() => setUserToEdit(null)}
        size="wide"
        title="Edit User"
      >
        <form className="stack-form" onSubmit={onSaveUser}>
          <UserAccessForm
            entityOptions={entityOptions}
            onChange={setEditUser}
            roles={roles.data ?? []}
            value={editUser}
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              onClick={() => setUserToEdit(null)}
              type="button"
            >
              Cancel
            </Button>
            <Button disabled={saveUserMutation.isPending} type="submit">
              Save User
            </Button>
          </div>
        </form>
        {saveUserMutation.error ? (
          <p className="inline-error">{saveUserMutation.error.message}</p>
        ) : null}
      </Modal>
    </section>
  );
}

const emptyEditUserForm: EditUserForm = {
  accessLevel: "USER",
  customRoleIds: [],
  email: "",
  entityIds: [],
  fullName: "",
  isAdmin: false,
  isActive: false,
  password: "",
  primaryRoleId: "",
  username: "",
};

function buildRoleIds(roles: AdminRole[], value: EditUserForm) {
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const nextRoleIds: string[] = [];
  const selectedPrimaryRole = roleById.get(value.primaryRoleId);
  const fallbackRole = roleByCode.get(
    value.isAdmin
      ? "administration_manager"
      : accessRoleCodeByLevel[value.accessLevel],
  );
  const primaryRole =
    selectedPrimaryRole && isPrimaryAssignableRole(selectedPrimaryRole)
      ? selectedPrimaryRole
      : fallbackRole;
  if (primaryRole) nextRoleIds.push(primaryRole.id);
  return Array.from(new Set(nextRoleIds));
}

type UserAccessFormProps = {
  entityOptions: Array<{ label: string; value: string }>;
  isNewUser?: boolean;
  onChange: Dispatch<SetStateAction<EditUserForm>>;
  roles: AdminRole[];
  value: EditUserForm;
};

function UserAccessForm({
  entityOptions,
  isNewUser = false,
  onChange,
  roles,
  value,
}: UserAccessFormProps) {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const primaryRole =
    roleById.get(value.primaryRoleId) ?? resolveBaseRole(roles, value);
  const primaryRequiredScope = primaryRole
    ? requiredAccessLevelForRole(primaryRole)
    : null;
  const effectiveRoleIds = buildRoleIds(roles, value);
  const effectiveRoles = roles.filter((role) =>
    effectiveRoleIds.includes(role.id),
  );
  const effectivePermissions = Array.from(
    new Set(effectiveRoles.flatMap((role) => role.permissionCodes)),
  ).sort();
  const riskyPermissions = effectivePermissions.filter(isRiskyPermission);
  const primaryRoleOptions = roles.map((role) => ({
    disabled: !isPrimaryAssignableRole(role),
    label:
      role.code === "platform_super_admin"
        ? `${formatRoleName(role)} - Platform only`
        : `${formatRoleName(role)}${role.isSystemRole ? " - System" : " - Custom"}`,
    value: role.id,
  }));
  const setPrimaryRole = (roleId: string) => {
    const role = roleById.get(roleId);
    const requiredScope = role ? requiredAccessLevelForRole(role) : null;
    onChange((currentValue) => ({
      ...currentValue,
      accessLevel: requiredScope ?? currentValue.accessLevel,
      customRoleIds: [],
      entityIds:
        (requiredScope ?? currentValue.accessLevel) === "GROUP"
          ? []
          : currentValue.entityIds,
      isAdmin: role ? isAdministrationRole(role.code) : false,
      primaryRoleId: roleId,
    }));
  };
  const toggleEntity = (entityId: string) => {
    onChange((currentValue) => {
      if (currentValue.entityIds.includes(entityId)) {
        return {
          ...currentValue,
          entityIds: currentValue.entityIds.filter(
            (currentEntityId) => currentEntityId !== entityId,
          ),
        };
      }
      return {
        ...currentValue,
        entityIds: [...currentValue.entityIds, entityId],
      };
    });
  };
  return (
    <>
      <div className="user-edit-grid">
        <FormField label="Username">
          <TextInput
            onChange={(event) =>
              onChange((currentValue) => ({
                ...currentValue,
                username: event.target.value,
              }))
            }
            required
            value={value.username}
          />
        </FormField>
        <FormField label="Full Name">
          <TextInput
            onChange={(event) =>
              onChange((currentValue) => ({
                ...currentValue,
                fullName: event.target.value,
              }))
            }
            required
            value={value.fullName}
          />
        </FormField>
        <FormField label="Email">
          <TextInput
            onChange={(event) =>
              onChange((currentValue) => ({
                ...currentValue,
                email: event.target.value,
              }))
            }
            required
            type="email"
            value={value.email}
          />
        </FormField>
        <FormField
          helperText={
            isNewUser ? undefined : "Leave blank to keep current password."
          }
          label="Password"
        >
          <TextInput
            onChange={(event) =>
              onChange((currentValue) => ({
                ...currentValue,
                password: event.target.value,
              }))
            }
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
              onChange={(event) =>
                onChange((currentValue) => ({
                  ...currentValue,
                  isActive: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Active
          </label>
        </div>
      </div>

      <section className="user-role-section">
        <div className="user-role-section-heading">
          <div>
            <p className="eyebrow">Role & Access</p>
            <h3>Select user role</h3>
            <span>
              Pick one role. Custom roles created in Admin &gt; Roles appear in
              this list.
            </span>
          </div>
        </div>
        <div className="role-select-grid">
          <FormField label="Primary Role">
            <Select
              onChange={(event) => setPrimaryRole(event.target.value)}
              options={primaryRoleOptions}
              placeholder="Select user role"
              required
              value={primaryRole?.id ?? ""}
            />
          </FormField>
          <div className="selected-role-strip">
            <div>
              <span>Selected role</span>
              <strong>
                {primaryRole ? formatRoleName(primaryRole) : "No role selected"}
              </strong>
              <small>
                {primaryRole?.description ??
                  "Select a role to apply its permissions and recommended access scope."}
              </small>
            </div>
            <StatusBadge tone={primaryRole ? "success" : "warning"}>
              {primaryRole
                ? primaryRole.isSystemRole
                  ? "System"
                  : "Custom"
                : "Required"}
            </StatusBadge>
          </div>
        </div>
        <div className="platform-super-admin-note">
          Platform Super Admin is not assigned here. It is a platform-level
          account flag managed outside tenant user setup.
        </div>
      </section>

      <section className="user-role-section">
        <div className="user-role-section-heading">
          <div>
            <p className="eyebrow">Visibility</p>
            <h3>What tenders can this user see?</h3>
            <span>Locked options are controlled by the selected role.</span>
          </div>
        </div>
        <div className="user-role-card-grid">
          {accessLevelOptions.map((option) => (
            <button
              className={`user-role-card ${value.accessLevel === option.code ? "user-role-card-selected" : ""}`.trim()}
              disabled={Boolean(
                primaryRequiredScope && primaryRequiredScope !== option.code,
              )}
              key={option.code}
              onClick={() =>
                onChange((currentValue) => ({
                  ...currentValue,
                  accessLevel: option.code,
                  entityIds:
                    option.code === "GROUP" ? [] : currentValue.entityIds,
                }))
              }
              type="button"
            >
              <span className="user-role-card-icon">
                {value.accessLevel === option.code ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
              </span>
              <strong>{option.name}</strong>
              <em>{option.label}</em>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="mapped-entity-section">
        <div>
          <strong>Mapped Entities</strong>
          <span>
            {value.accessLevel === "GROUP"
              ? "Not required for group-wide access."
              : value.accessLevel === "ENTITY"
                ? "Required for ENTITY access."
                : "Used for owner assignment eligibility; tender visibility stays assigned-only."}
          </span>
        </div>
        <div
          className={`mapped-entity-grid ${value.accessLevel === "GROUP" ? "mapped-entity-grid-disabled" : ""}`.trim()}
        >
          {entityOptions.map((entity) => (
            <label className="mapped-entity-option" key={entity.value}>
              <input
                checked={value.entityIds.includes(entity.value)}
                disabled={value.accessLevel === "GROUP"}
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
            <p className="eyebrow">Final Preview</p>
            <h3>
              {effectiveRoles.length} roles · {effectivePermissions.length}{" "}
              permissions
            </h3>
          </div>
          <StatusBadge
            tone={riskyPermissions.length > 0 ? "warning" : "success"}
          >
            {riskyPermissions.length > 0 ? "Review" : "Standard"}
          </StatusBadge>
        </div>
        <div className="access-preview-grid">
          <div>
            <strong>Roles</strong>
            <p>{effectiveRoles.map(formatRoleName).join(", ") || "-"}</p>
          </div>
          <div>
            <strong>Entity Scope</strong>
            <p>
              {value.accessLevel === "GROUP"
                ? "All entities"
                : `${value.entityIds.length} mapped entities`}
            </p>
          </div>
          <div>
            <strong>Admin Config</strong>
            <p>
              {value.isAdmin
                ? "Administration Manager"
                : "No admin console access"}
            </p>
          </div>
          <div>
            <strong>Risk Signals</strong>
            <p>
              {riskyPermissions.length
                ? riskyPermissions.join(", ")
                : "No high-risk permissions selected"}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function resolveBaseRole(
  roles: AdminRole[],
  value: Pick<EditUserForm, "accessLevel" | "isAdmin">,
) {
  const roleCode = value.isAdmin
    ? "administration_manager"
    : accessRoleCodeByLevel[value.accessLevel];
  return roles.find((role) => role.code === roleCode);
}

function formatRoleName(role: Pick<AdminRole, "code" | "name">) {
  if (role.code === "platform_super_admin") return "Super Admin";
  if (role.code === "tenant_admin") return "Administration Manager";
  if (role.code === "group_viewer") return "Group Manager";
  return role.name;
}

function resolvePrimaryRoleId(roles: AdminRole[], user: AdminUser) {
  const preferredRoleCode = hasAdministrationRole(user.roleCodes)
    ? "administration_manager"
    : accessRoleCodeByLevel[user.accessLevel];
  const preferredRole = roles.find(
    (role) => role.code === preferredRoleCode && user.roleIds.includes(role.id),
  );
  if (preferredRole) return preferredRole.id;
  return (
    user.roleIds.find((roleId) => {
      const role = roles.find((item) => item.id === roleId);
      return role ? isPrimaryAssignableRole(role) : false;
    }) ?? ""
  );
}

function isPrimaryAssignableRole(role: AdminRole) {
  return role.code !== "platform_super_admin";
}

function requiredAccessLevelForRole(
  role: Pick<AdminRole, "code" | "permissionCodes">,
): AccessLevel | null {
  if (
    [
      "administration_manager",
      "group_manager",
      "group_viewer",
      "platform_super_admin",
      "report_viewer",
      "tenant_admin",
    ].includes(role.code)
  )
    return "GROUP";
  if (role.code === "entity_manager") return "ENTITY";
  if (role.code === "tender_owner") return "USER";
  if (
    role.permissionCodes.some((permission) =>
      [
        "admin.console.access",
        "case.delay.manage.all",
        "case.read.all",
        "case.update.all",
        "role.manage",
        "system.config.manage",
        "tenant.manage",
        "user.manage",
        "user.read.all",
      ].includes(permission),
    )
  ) {
    return "GROUP";
  }
  if (
    role.permissionCodes.some((permission) =>
      [
        "case.delay.manage.entity",
        "case.read.entity",
        "case.update.entity",
        "planning.manage",
        "user.read.entity",
      ].includes(permission),
    )
  ) {
    return "ENTITY";
  }
  if (
    role.permissionCodes.some((permission) =>
      ["case.create", "case.read.assigned", "case.update.assigned"].includes(
        permission,
      ),
    )
  ) {
    return "USER";
  }
  return null;
}

function isRiskyPermission(permission: string) {
  return [
    "admin.console.access",
    "case.delete",
    "case.delay.manage.all",
    "case.restore",
    "case.update.all",
    "import.manage",
    "role.manage",
    "system.config.manage",
    "tenant.manage",
    "user.manage",
  ].includes(permission);
}

function hasAdministrationRole(roleCodes: string[]) {
  return roleCodes.some(isAdministrationRole);
}

function isAdministrationRole(roleCode: string) {
  return administrationRoleCodes.includes(roleCode);
}

function formatAdminRoleBadge(user: AdminUser) {
  if (user.isPlatformSuperAdmin) {
    return <StatusBadge tone="success">Super Admin</StatusBadge>;
  }
  if (hasAdministrationRole(user.roleCodes)) {
    return <StatusBadge tone="success">Administration Manager</StatusBadge>;
  }
  return "-";
}

function resolveSavedStatus(
  currentStatus: AdminUser["status"],
  editUser: EditUserForm,
): AdminUser["status"] {
  if (editUser.isActive) return "active";
  if (currentStatus === "pending_password_setup" && !editUser.password.trim())
    return "pending_password_setup";
  return "inactive";
}

function formatEntitySummary(entityCodes: string[]) {
  if (entityCodes.length === 0) return "-";
  const visibleCodes = entityCodes.slice(0, 2).join(", ");
  const remainingCount = entityCodes.length - 2;
  return remainingCount > 0
    ? `${visibleCodes} +${remainingCount}`
    : visibleCodes;
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

function AccessLevelBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
}) {
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
