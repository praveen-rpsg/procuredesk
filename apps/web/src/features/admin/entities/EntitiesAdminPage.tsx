import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAdminEntity,
  deleteAdminEntity,
  listAdminEntities,
  updateAdminEntity,
  type AdminEntity,
} from "../api/adminApi";
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
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type EntitiesAdminPageProps = {
  onManageDepartments?: (entityId: string) => void;
};

const suggestedDepartments = ["Commercial", "Civil", "Stores", "Finance", "HR & Admin", "IT", "Mechanical", "Electrical"];

const entityColumns = (
  onDelete: (entity: AdminEntity) => void,
  onEdit: (entity: AdminEntity) => void,
  onManageDepartments: ((entityId: string) => void) | undefined,
): DataTableColumn<AdminEntity>[] => [
  { key: "code", header: "Code", render: (row) => row.code },
  { key: "name", header: "Entity Name", render: (row) => row.name },
  {
    key: "departments",
    header: "Departments",
    render: (row) => formatDepartmentSummary(row.departments, row.departmentCount),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>,
  },
  { key: "tenders", header: "Tenders", render: (row) => row.tenderCount },
  {
    key: "action",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <IconButton
          aria-label={`Manage departments for ${row.name}`}
          onClick={() => onManageDepartments?.(row.id)}
          tooltip="Manage departments"
        >
          <FolderTree size={17} />
        </IconButton>
        <IconButton aria-label={`Edit ${row.name}`} onClick={() => onEdit(row)} tooltip="Edit entity">
          <Pencil size={17} />
        </IconButton>
        <IconButton
          aria-label={`Delete ${row.name}`}
          disabled={row.tenderCount > 0}
          onClick={() => onDelete(row)}
          tooltip={row.tenderCount > 0 ? "Entity has tenders and cannot be deleted" : "Delete entity"}
          variant="danger"
        >
          <Trash2 size={17} />
        </IconButton>
      </div>
    ),
  },
];

export function EntitiesAdminPage({ onManageDepartments }: EntitiesAdminPageProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["admin-entities"] });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<AdminEntity | null>(null);
  const [newEntity, setNewEntity] = useState({ code: "", departmentsText: "", name: "" });
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [editEntity, setEditEntity] = useState({ code: "", isActive: true, name: "" });

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
      setSelectedEntityId(result.id);
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-departments"] });
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
      setEntityToDelete(null);
      setSelectedEntityId("");
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-departments"] });
      notify({ message: "Entity deleted.", tone: "success" });
    },
  });

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const onUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateMutation.mutate();
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

  return (
    <section className="admin-section">
      <PageHeader
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus size={18} />
            New Entity
          </Button>
        }
        eyebrow="Admin"
        title="Entities"
      >
        Maintain tenant business entities in a table-first view.
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
              <h2>Business Entities</h2>
            </div>
            <Building2 size={20} />
          </div>
          {entities.isLoading ? (
            <Skeleton height={20} />
          ) : entities.error ? (
            <p className="inline-error">{entities.error.message}</p>
          ) : (entities.data ?? []).length > 0 ? (
            <DataTable
              columns={entityColumns(setEntityToDelete, openEdit, onManageDepartments)}
              getRowKey={(row) => row.id}
              rows={entities.data ?? []}
            />
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
              helperText="Optional. These departments are created with the entity and can be managed later from Admin > Departments."
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
                <p className="entity-department-empty">Best practice: add core departments now, then maintain changes from the Departments section.</p>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setIsCreateOpen(false)} type="button">
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
                  onManageDepartments?.(selectedEntity.id);
                }}
                type="button"
              >
                Manage Departments
              </Button>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setIsEditOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={!selectedEntity || updateMutation.isPending} type="submit">
                Save Entity
              </Button>
            </div>
          </form>
          {updateMutation.error ? <p className="inline-error">{updateMutation.error.message}</p> : null}
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
