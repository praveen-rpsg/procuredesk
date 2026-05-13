import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAdminDepartment,
  createAdminEntity,
  deleteAdminDepartment,
  deleteAdminEntity,
  listAdminDepartments,
  listAdminEntities,
  updateAdminDepartment,
  updateAdminEntity,
  type AdminDepartment,
  type AdminEntity,
} from "../api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageEntities } from "../../../shared/auth/permissions";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { EmptyState } from "../../../shared/ui/empty-state/EmptyState";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type EntitiesAdminPageProps = {
  focusEntityId?: string;
};

const suggestedDepartments = ["Commercial", "Civil", "Stores", "Finance", "HR & Admin", "IT", "Mechanical", "Electrical"];

export function EntitiesAdminPage({ focusEntityId = "" }: EntitiesAdminPageProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageEntities(user);
  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["admin-entities"] });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<AdminEntity | null>(null);
  const [departmentCreateEntity, setDepartmentCreateEntity] = useState<AdminEntity | null>(null);
  const [departmentToDelete, setDepartmentToDelete] = useState<AdminDepartment | null>(null);
  const [departmentToEdit, setDepartmentToEdit] = useState<AdminDepartment | null>(null);
  const [newEntity, setNewEntity] = useState({ code: "", departmentsText: "", name: "" });
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [expandedEntityId, setExpandedEntityId] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [editDepartment, setEditDepartment] = useState({ isActive: true, name: "" });
  const [editEntity, setEditEntity] = useState({ code: "", isActive: true, name: "" });

  useEffect(() => {
    if (focusEntityId) {
      setExpandedEntityId(focusEntityId);
    }
  }, [focusEntityId]);

  const expandedDepartments = useQuery({
    enabled: Boolean(expandedEntityId),
    queryFn: () => listAdminDepartments(expandedEntityId),
    queryKey: ["admin-departments", expandedEntityId],
  });

  const selectedEntity = useMemo(
    () => entities.data?.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities.data, selectedEntityId],
  );
  const draftDepartments = useMemo(() => parseDepartmentLines(newEntity.departmentsText), [newEntity.departmentsText]);
  const entityStats = useMemo(() => {
    const rows = entities.data ?? [];
    return {
      active: rows.filter((entity) => entity.isActive).length,
      departments: rows.reduce((total, entity) => total + entity.departmentCount, 0),
      entities: rows.length,
      tenders: rows.reduce((total, entity) => total + entity.tenderCount, 0),
    };
  }, [entities.data]);

  useEffect(() => {
    if (selectedEntity) {
      setEditEntity({
        code: selectedEntity.code,
        isActive: selectedEntity.isActive,
        name: selectedEntity.name,
      });
    }
  }, [selectedEntity]);

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminEntity({
        code: newEntity.code,
        departments: parseDepartmentLines(newEntity.departmentsText),
        name: newEntity.name,
      }),
    onSuccess: async (result) => {
      setNewEntity({ code: "", departmentsText: "", name: "" });
      setExpandedEntityId(result.id);
      setSelectedEntityId(result.id);
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-departments", result.id] });
      notify({ message: "Entity created.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAdminEntity(selectedEntityId, {
        code: editEntity.code,
        isActive: editEntity.isActive,
        name: editEntity.name,
      }),
    onSuccess: async () => {
      setIsEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-departments"] });
      notify({ message: "Entity saved.", tone: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminEntity(entityToDelete?.id ?? ""),
    onSuccess: async () => {
      const deletedEntityId = entityToDelete?.id;
      setEntityToDelete(null);
      setSelectedEntityId("");
      if (deletedEntityId === expandedEntityId) {
        setExpandedEntityId("");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      if (deletedEntityId) {
        await queryClient.invalidateQueries({ queryKey: ["admin-departments", deletedEntityId] });
      }
      notify({ message: "Entity deleted.", tone: "success" });
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: () => {
      if (!departmentCreateEntity) throw new Error("Select an entity before creating a department.");
      return createAdminDepartment(departmentCreateEntity.id, { name: newDepartmentName });
    },
    onSuccess: async () => {
      const entityId = departmentCreateEntity?.id;
      setNewDepartmentName("");
      setDepartmentCreateEntity(null);
      if (entityId) {
        setExpandedEntityId(entityId);
        await queryClient.invalidateQueries({ queryKey: ["admin-departments", entityId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      notify({ message: "Department created.", tone: "success" });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: () => {
      if (!departmentToEdit) throw new Error("Select a department before saving.");
      return updateAdminDepartment(departmentToEdit.id, editDepartment);
    },
    onSuccess: async () => {
      const entityId = departmentToEdit?.entityId;
      setDepartmentToEdit(null);
      if (entityId) {
        await queryClient.invalidateQueries({ queryKey: ["admin-departments", entityId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      notify({ message: "Department saved.", tone: "success" });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: () => deleteAdminDepartment(departmentToDelete?.id ?? ""),
    onSuccess: async () => {
      const entityId = departmentToDelete?.entityId;
      setDepartmentToDelete(null);
      if (entityId) {
        await queryClient.invalidateQueries({ queryKey: ["admin-departments", entityId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      notify({ message: "Department deleted.", tone: "success" });
    },
  });

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    createMutation.mutate();
  };

  const onUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    updateMutation.mutate();
  };

  const onCreateDepartment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    createDepartmentMutation.mutate();
  };

  const onUpdateDepartment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    updateDepartmentMutation.mutate();
  };

  const openEdit = (entity: AdminEntity) => {
    setSelectedEntityId(entity.id);
    setEditEntity({
      code: entity.code,
      isActive: entity.isActive,
      name: entity.name,
    });
    setIsEditOpen(true);
  };

  const openCreateDepartment = (entity: AdminEntity) => {
    setDepartmentCreateEntity(entity);
    setNewDepartmentName("");
    setExpandedEntityId(entity.id);
  };

  const openDepartmentEdit = (department: AdminDepartment) => {
    setDepartmentToEdit(department);
    setEditDepartment({
      isActive: department.isActive,
      name: department.name,
    });
  };

  return (
    <section className="admin-section">
      <PageHeader
        actions={
          canManage ? (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus size={18} />
            New Entity
          </Button>
          ) : null
        }
        eyebrow="Admin"
        title="Entities & Departments"
      >
        Maintain tenant entities and their departments from one table.
      </PageHeader>

      <div className="admin-stack">
        <section className="org-summary-grid" aria-label="Entity summary">
          <OrgSummaryCard label="Entities" value={entityStats.entities} />
          <OrgSummaryCard label="Active" value={entityStats.active} tone="success" />
          <OrgSummaryCard label="Departments" value={entityStats.departments} />
          <OrgSummaryCard label="Linked Tenders" value={entityStats.tenders} />
        </section>

        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>Entities & Departments</h2>
            </div>
            <Building2 size={20} />
          </div>
          {entities.isLoading ? (
            <Skeleton height={20} />
          ) : entities.error ? (
            <p className="inline-error">{entities.error.message}</p>
          ) : (entities.data ?? []).length > 0 ? (
            <div aria-label="Entities and departments" className="table-shell entity-tree-table" role="region" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th aria-label="Expand departments" />
                    <th scope="col">Code</th>
                    <th scope="col">Entity / Department</th>
                    <th scope="col">Status</th>
                    <th scope="col">Tenders</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(entities.data ?? []).map((entity) => {
                    const isExpanded = expandedEntityId === entity.id;
                    return (
                      <Fragment key={entity.id}>
                        <tr className={isExpanded ? "entity-tree-row entity-tree-row-expanded" : "entity-tree-row"}>
                          <td className="entity-tree-toggle-cell">
                            <IconButton
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} departments for ${entity.name}`}
                              onClick={() => setExpandedEntityId((currentId) => (currentId === entity.id ? "" : entity.id))}
                              tooltip={isExpanded ? "Collapse departments" : "Show departments"}
                            >
                              {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                            </IconButton>
                          </td>
                          <td className="col-mono">{entity.code}</td>
                          <td>
                            <div className="entity-tree-title">
                              <strong>{entity.name}</strong>
                              <span>{formatDepartmentSummary(entity.departments, entity.departmentCount)}</span>
                            </div>
                          </td>
                          <td>
                            <StatusBadge tone={entity.isActive ? "success" : "neutral"}>
                              {entity.isActive ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          <td>{entity.tenderCount}</td>
                          <td>
                            <div className="row-actions">
                              {canManage ? (
                                <IconButton
                                  aria-label={`Add department under ${entity.name}`}
                                  onClick={() => openCreateDepartment(entity)}
                                  tooltip="Add department"
                                >
                                  <Plus size={17} />
                                </IconButton>
                              ) : null}
                              {canManage ? (
                                <>
                                  <IconButton aria-label={`Edit ${entity.name}`} onClick={() => openEdit(entity)} tooltip="Edit entity">
                                    <Pencil size={17} />
                                  </IconButton>
                                  <IconButton
                                    aria-label={`Delete ${entity.name}`}
                                    disabled={entity.tenderCount > 0}
                                    onClick={() => setEntityToDelete(entity)}
                                    tooltip={entity.tenderCount > 0 ? "Entity has tenders and cannot be deleted" : "Delete entity"}
                                    variant="danger"
                                  >
                                    <Trash2 size={17} />
                                  </IconButton>
                                </>
                              ) : (
                                "-"
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="entity-departments-row">
                            <td colSpan={6}>
                              <div className="entity-departments-panel">
                                <div className="entity-departments-panel-header">
                                  <div>
                                    <strong>Departments for {entity.name}</strong>
                                    <span>{entity.departmentCount} active departments</span>
                                  </div>
                                  {canManage ? (
                                    <Button variant="secondary" onClick={() => openCreateDepartment(entity)} type="button">
                                      <Plus size={16} />
                                      New Department
                                    </Button>
                                  ) : null}
                                </div>
                                {expandedDepartments.isLoading ? (
                                  <Skeleton height={16} />
                                ) : expandedDepartments.error ? (
                                  <p className="inline-error">{expandedDepartments.error.message}</p>
                                ) : (expandedDepartments.data ?? []).length > 0 ? (
                                  <table className="entity-departments-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Department</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Tenders</th>
                                        <th scope="col">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(expandedDepartments.data ?? []).map((department) => (
                                        <tr key={department.id}>
                                          <td>
                                            <div className="entity-tree-title">
                                              <strong>{department.name}</strong>
                                              <span>{entity.code}</span>
                                            </div>
                                          </td>
                                          <td>
                                            <StatusBadge tone={department.isActive ? "success" : "neutral"}>
                                              {department.isActive ? "Active" : "Inactive"}
                                            </StatusBadge>
                                          </td>
                                          <td>{department.tenderCount}</td>
                                          <td>
                                            {canManage ? (
                                              <div className="row-actions">
                                                <IconButton
                                                  aria-label={`Edit ${department.name}`}
                                                  onClick={() => openDepartmentEdit(department)}
                                                  tooltip="Edit department"
                                                >
                                                  <Pencil size={17} />
                                                </IconButton>
                                                <IconButton
                                                  aria-label={`Delete ${department.name}`}
                                                  disabled={department.tenderCount > 0}
                                                  onClick={() => setDepartmentToDelete(department)}
                                                  tooltip={
                                                    department.tenderCount > 0
                                                      ? "Department has tenders and cannot be deleted"
                                                      : "Delete department"
                                                  }
                                                  variant="danger"
                                                >
                                                  <Trash2 size={17} />
                                                </IconButton>
                                              </div>
                                            ) : (
                                              "-"
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="entity-departments-empty">No departments under this entity yet.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No entities yet">
              <Building2 size={18} />
            </EmptyState>
          )}
        </section>

        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} size="wide" title="New Entity">
          <form className="stack-form entity-create-form" onSubmit={onCreate}>
            <FormField label="Code">
              <TextInput
                maxLength={32}
                onChange={(event) => setNewEntity((value) => ({ ...value, code: event.target.value.toUpperCase() }))}
                required
                value={newEntity.code}
              />
            </FormField>
            <FormField label="Name">
              <TextInput
                maxLength={200}
                onChange={(event) => setNewEntity((value) => ({ ...value, name: event.target.value }))}
                required
                value={newEntity.name}
              />
            </FormField>
            <FormField
              helperText="Optional. These departments are created with the entity and can be managed later from this table."
              label="Initial Departments"
            >
              <TextArea
                onChange={(event) => setNewEntity((value) => ({ ...value, departmentsText: event.target.value }))}
                placeholder={"Mechanical\nElectrical\nIT\nCivil"}
                value={newEntity.departmentsText}
              />
            </FormField>
            <div className="entity-department-builder">
              <div className="entity-department-builder-header">
                <div>
                  <span>{draftDepartments.length} departments ready</span>
                  <small>Paste one per line or add common choices below.</small>
                </div>
                {draftDepartments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setNewEntity((value) => ({ ...value, departmentsText: "" }))}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="entity-department-suggestions" aria-label="Suggested departments">
                {suggestedDepartments.map((department) => {
                  const isSelected = draftDepartments.some((item) => item.toLowerCase() === department.toLowerCase());
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={isSelected ? "entity-department-suggestion is-selected" : "entity-department-suggestion"}
                      disabled={isSelected}
                      key={department}
                      onClick={() =>
                        setNewEntity((value) => ({
                          ...value,
                          departmentsText: addDepartmentToDraft(value.departmentsText, department),
                        }))
                      }
                      type="button"
                    >
                      {isSelected ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                      {department}
                    </button>
                  );
                })}
              </div>
              {draftDepartments.length > 0 ? (
                <div className="entity-department-chip-list" aria-label="Departments to create">
                  {draftDepartments.map((department) => (
                    <span className="entity-department-chip" key={department}>
                      {department}
                      <button
                        aria-label={`Remove ${department}`}
                        onClick={() =>
                          setNewEntity((value) => ({
                            ...value,
                            departmentsText: parseDepartmentLines(value.departmentsText)
                              .filter((item) => item.toLowerCase() !== department.toLowerCase())
                              .join("\n"),
                          }))
                        }
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="entity-department-empty">Best practice: add core departments now, then maintain changes from the entity row.</p>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={createMutation.isPending} type="submit">
                {draftDepartments.length > 0 ? "Create Entity & Departments" : "Create Entity"}
              </Button>
            </div>
          </form>
          {createMutation.error ? <p className="inline-error">{createMutation.error.message}</p> : null}
        </Modal>

        <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={selectedEntity ? selectedEntity.name : "Edit Entity"}>
          <form className="stack-form" onSubmit={onUpdate}>
            <FormField label="Code">
              <TextInput
                disabled={!selectedEntity}
                maxLength={32}
                onChange={(event) => setEditEntity((value) => ({ ...value, code: event.target.value.toUpperCase() }))}
                required
                value={editEntity.code}
              />
            </FormField>
            <FormField label="Name">
              <TextInput
                disabled={!selectedEntity}
                maxLength={200}
                onChange={(event) => setEditEntity((value) => ({ ...value, name: event.target.value }))}
                required
                value={editEntity.name}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={editEntity.isActive}
                disabled={!selectedEntity}
                onChange={(event) => setEditEntity((value) => ({ ...value, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active
            </label>
            <div className="entity-department-summary">
              <div>
                <p className="eyebrow">Departments</p>
                <strong>{selectedEntity?.departmentCount ?? 0}</strong>
                <span>
                  {selectedEntity
                    ? formatDepartmentSummary(selectedEntity.departments, selectedEntity.departmentCount)
                    : "-"}
                </span>
              </div>
              <Button
                variant="secondary"
                disabled={!selectedEntity}
                onClick={() => {
                  if (!selectedEntity) return;
                  setIsEditOpen(false);
                  openCreateDepartment(selectedEntity);
                }}
                type="button"
              >
                Add Department
              </Button>
            </div>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setIsEditOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={!selectedEntity || updateMutation.isPending} type="submit">
                Save Entity
              </Button>
            </div>
          </form>
          {updateMutation.error ? <p className="inline-error">{updateMutation.error.message}</p> : null}
        </Modal>

        <Modal
          isOpen={Boolean(departmentCreateEntity)}
          onClose={() => setDepartmentCreateEntity(null)}
          title={departmentCreateEntity ? `New Department - ${departmentCreateEntity.code}` : "New Department"}
        >
          <form className="stack-form" onSubmit={onCreateDepartment}>
            <FormField label="Name">
              <TextInput
                disabled={!departmentCreateEntity}
                maxLength={200}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                required
                value={newDepartmentName}
              />
            </FormField>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setDepartmentCreateEntity(null)} type="button">
                Cancel
              </Button>
              <Button disabled={!departmentCreateEntity || createDepartmentMutation.isPending} type="submit">
                Create Department
              </Button>
            </div>
          </form>
          {createDepartmentMutation.error ? <p className="inline-error">{createDepartmentMutation.error.message}</p> : null}
        </Modal>

        <Modal
          isOpen={Boolean(departmentToEdit)}
          onClose={() => setDepartmentToEdit(null)}
          title={departmentToEdit ? departmentToEdit.name : "Edit Department"}
        >
          <form className="stack-form" onSubmit={onUpdateDepartment}>
            <FormField label="Name">
              <TextInput
                disabled={!departmentToEdit}
                maxLength={200}
                onChange={(event) => setEditDepartment((value) => ({ ...value, name: event.target.value }))}
                required
                value={editDepartment.name}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={editDepartment.isActive}
                disabled={!departmentToEdit}
                onChange={(event) => setEditDepartment((value) => ({ ...value, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active
            </label>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setDepartmentToEdit(null)} type="button">
                Cancel
              </Button>
              <Button disabled={!departmentToEdit || updateDepartmentMutation.isPending} type="submit">
                Save Department
              </Button>
            </div>
          </form>
          {updateDepartmentMutation.error ? <p className="inline-error">{updateDepartmentMutation.error.message}</p> : null}
        </Modal>

        <ConfirmationDialog
          confirmLabel="Delete Entity"
          description={
            entityToDelete
              ? `Delete ${entityToDelete.name}? This will also remove its department choices and user entity scopes.`
              : "Delete this entity?"
          }
          isOpen={Boolean(entityToDelete)}
          isPending={deleteMutation.isPending}
          onCancel={() => setEntityToDelete(null)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete Entity"
          tone="danger"
        >
          {deleteMutation.error ? <p className="inline-error">{deleteMutation.error.message}</p> : null}
        </ConfirmationDialog>

        <ConfirmationDialog
          confirmLabel="Delete Department"
          description={
            departmentToDelete
              ? `Delete ${departmentToDelete.name}? It will be removed from new case form choices.`
              : "Delete this department?"
          }
          isOpen={Boolean(departmentToDelete)}
          isPending={deleteDepartmentMutation.isPending}
          onCancel={() => setDepartmentToDelete(null)}
          onConfirm={() => deleteDepartmentMutation.mutate()}
          title="Delete Department"
          tone="danger"
        >
          {deleteDepartmentMutation.error ? <p className="inline-error">{deleteDepartmentMutation.error.message}</p> : null}
        </ConfirmationDialog>
      </div>
    </section>
  );
}

function parseDepartmentLines(value: string): string[] {
  const departments = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    const department = line.trim();
    if (department) {
      departments.set(department.toLowerCase(), department);
    }
  }
  return [...departments.values()];
}

function addDepartmentToDraft(currentValue: string, department: string) {
  return parseDepartmentLines(`${currentValue}\n${department}`).join("\n");
}

function OrgSummaryCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "success";
  value: number;
}) {
  return (
    <div className={`org-summary-card org-summary-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDepartmentSummary(departments: string[], departmentCount: number) {
  if (departmentCount === 0) return "-";
  const visibleDepartments = departments.slice(0, 3).join(", ");
  const remainingCount = departmentCount - departments.slice(0, 3).length;
  return remainingCount > 0 ? `${visibleDepartments} +${remainingCount}` : visibleDepartments;
}
