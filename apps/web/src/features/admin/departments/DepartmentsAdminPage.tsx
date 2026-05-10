import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAdminDepartment,
  deleteAdminDepartment,
  listAdminDepartments,
  listAdminEntities,
  updateAdminDepartment,
  type AdminDepartment,
} from "../api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageEntities } from "../../../shared/auth/permissions";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { EmptyState } from "../../../shared/ui/empty-state/EmptyState";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

const departmentColumns = (
  onDelete: (department: AdminDepartment) => void,
  onSelect: (department: AdminDepartment) => void,
  selectedDepartmentId: string,
  canManage: boolean,
): DataTableColumn<AdminDepartment>[] => [
  { key: "name", header: "Department", render: (row) => row.name },
  { key: "tenders", header: "Tenders", render: (row) => row.tenderCount },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>,
  },
  {
    key: "action",
    header: "Actions",
    render: (row) =>
      canManage ? (
      <div className="row-actions">
        <IconButton
          aria-label={`Edit ${row.name}`}
          onClick={() => onSelect(row)}
          tooltip="Edit department"
          variant={row.id === selectedDepartmentId ? "primary" : "secondary"}
        >
          <Pencil size={17} />
        </IconButton>
        <IconButton
          aria-label={`Delete ${row.name}`}
          disabled={row.tenderCount > 0}
          onClick={() => onDelete(row)}
          tooltip={row.tenderCount > 0 ? "Department has tenders and cannot be deleted" : "Delete department"}
          variant="danger"
        >
          <Trash2 size={17} />
        </IconButton>
      </div>
      ) : (
        "-"
      ),
  },
];

type DepartmentsAdminPageProps = {
  focusEntityId?: string;
  onEntityScopeChange?: (entityId: string) => void;
};

export function DepartmentsAdminPage({ focusEntityId = "", onEntityScopeChange }: DepartmentsAdminPageProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageEntities(user);
  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["admin-entities"] });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [departmentToDelete, setDepartmentToDelete] = useState<AdminDepartment | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [editDepartment, setEditDepartment] = useState({ isActive: true, name: "" });

  useEffect(() => {
    if (focusEntityId && focusEntityId !== selectedEntityId) {
      setSelectedEntityId(focusEntityId);
      setSelectedDepartmentId("");
    }
  }, [focusEntityId, selectedEntityId]);

  useEffect(() => {
    if (focusEntityId) return;
    const firstEntity = entities.data?.[0];
    if (!selectedEntityId && firstEntity) {
      setSelectedEntityId(firstEntity.id);
      onEntityScopeChange?.(firstEntity.id);
    }
  }, [entities.data, focusEntityId, onEntityScopeChange, selectedEntityId]);

  const departments = useQuery({
    enabled: Boolean(selectedEntityId),
    queryFn: () => listAdminDepartments(selectedEntityId),
    queryKey: ["admin-departments", selectedEntityId],
  });

  const selectedDepartment = useMemo(
    () => departments.data?.find((department) => department.id === selectedDepartmentId) ?? null,
    [departments.data, selectedDepartmentId],
  );
  const selectedEntity = useMemo(
    () => entities.data?.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities.data, selectedEntityId],
  );
  const departmentStats = useMemo(() => {
    const rows = departments.data ?? [];
    return {
      active: rows.filter((department) => department.isActive).length,
      departments: rows.length,
      linkedTenders: rows.reduce((total, department) => total + department.tenderCount, 0),
    };
  }, [departments.data]);

  useEffect(() => {
    if (selectedDepartment) {
      setEditDepartment({
        isActive: selectedDepartment.isActive,
        name: selectedDepartment.name,
      });
    }
  }, [selectedDepartment]);

  const createMutation = useMutation({
    mutationFn: () => createAdminDepartment(selectedEntityId, { name: newDepartmentName }),
    onSuccess: async (result) => {
      setNewDepartmentName("");
      setSelectedDepartmentId(result.id);
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-departments", selectedEntityId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      notify({ message: "Department created.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateAdminDepartment(selectedDepartmentId, editDepartment),
    onSuccess: async () => {
      setIsEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-departments", selectedEntityId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-entities"] });
      notify({ message: "Department saved.", tone: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminDepartment(departmentToDelete?.id ?? ""),
    onSuccess: async () => {
      setDepartmentToDelete(null);
      setSelectedDepartmentId("");
      await queryClient.invalidateQueries({ queryKey: ["admin-departments", selectedEntityId] });
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

  const openEdit = (department: AdminDepartment) => {
    setSelectedDepartmentId(department.id);
    setEditDepartment({
      isActive: department.isActive,
      name: department.name,
    });
    setIsEditOpen(true);
  };

  return (
    <section className="admin-section">
      <PageHeader
        actions={
          canManage ? (
          <Button disabled={!selectedEntityId} onClick={() => setIsCreateOpen(true)}>
            <Plus size={18} />
            New Department
          </Button>
          ) : null
        }
        eyebrow="Admin"
        title="Departments"
      >
        Select an entity, then manage its departments from the table.
      </PageHeader>

      <div className="admin-stack">
        <section className="state-panel entity-scope-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Entity</p>
              <h2>Department Scope</h2>
            </div>
            <Boxes size={20} />
          </div>
          <FormField label="Business Entity">
            <select
              className="text-input"
              disabled={entities.isLoading}
              onChange={(event) => {
                const nextEntityId = event.target.value;
                setSelectedEntityId(nextEntityId);
                setSelectedDepartmentId("");
                onEntityScopeChange?.(nextEntityId);
              }}
              value={selectedEntityId}
            >
              {(entities.data ?? []).map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.code} - {entity.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="entity-scope-card-grid">
            {(entities.data ?? []).map((entity) => (
              <button
                className={`entity-scope-card ${entity.id === selectedEntityId ? "entity-scope-card-selected" : ""}`.trim()}
                key={entity.id}
                onClick={() => {
                  setSelectedEntityId(entity.id);
                  setSelectedDepartmentId("");
                  onEntityScopeChange?.(entity.id);
                }}
                type="button"
              >
                <strong>{entity.code}</strong>
                <span>{entity.name}</span>
                <small>{entity.departmentCount} departments · {entity.tenderCount} tenders</small>
              </button>
            ))}
          </div>
        </section>

        <section className="org-summary-grid" aria-label="Department summary">
          <OrgSummaryCard label="Selected Entity" value={selectedEntity?.code ?? "-"} />
          <OrgSummaryCard label="Departments" value={departmentStats.departments} />
          <OrgSummaryCard label="Active" value={departmentStats.active} tone="success" />
          <OrgSummaryCard label="Linked Tenders" value={departmentStats.linkedTenders} />
        </section>

        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>Departments</h2>
            </div>
            <Boxes size={20} />
          </div>
          {departments.isLoading ? (
            <Skeleton height={20} />
          ) : departments.error ? (
            <p className="inline-error">{departments.error.message}</p>
          ) : (departments.data ?? []).length > 0 ? (
            <DataTable
              columns={departmentColumns(
                setDepartmentToDelete,
                openEdit,
                selectedDepartmentId,
                canManage,
              )}
              emptyMessage="No departments found."
              getRowKey={(row) => row.id}
              rows={departments.data ?? []}
            />
          ) : (
            <EmptyState title="No departments yet">
              <Boxes size={18} />
            </EmptyState>
          )}
        </section>

        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Department">
          <form className="stack-form" onSubmit={onCreate}>
            <FormField label="Name">
              <TextInput
                disabled={!selectedEntityId}
                maxLength={200}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                required
                value={newDepartmentName}
              />
            </FormField>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setIsCreateOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={!selectedEntityId || createMutation.isPending} type="submit">
                Create Department
              </Button>
            </div>
          </form>
          {createMutation.error ? <p className="inline-error">{createMutation.error.message}</p> : null}
        </Modal>

        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title={selectedDepartment ? selectedDepartment.name : "Edit Department"}
        >
          <form className="stack-form" onSubmit={onUpdate}>
            <FormField label="Name">
              <TextInput
                disabled={!selectedDepartment}
                maxLength={200}
                onChange={(event) => setEditDepartment((value) => ({ ...value, name: event.target.value }))}
                required
                value={editDepartment.name}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={editDepartment.isActive}
                disabled={!selectedDepartment}
                onChange={(event) => setEditDepartment((value) => ({ ...value, isActive: event.target.checked }))}
                type="checkbox"
              />
              Active
            </label>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setIsEditOpen(false)} type="button">
                Cancel
              </Button>
              <Button disabled={!selectedDepartment || updateMutation.isPending} type="submit">
                Save Department
              </Button>
            </div>
          </form>
          {updateMutation.error ? <p className="inline-error">{updateMutation.error.message}</p> : null}
        </Modal>

        <ConfirmationDialog
          confirmLabel="Delete Department"
          description={
            departmentToDelete
              ? `Delete ${departmentToDelete.name}? It will be removed from new case form choices.`
              : "Delete this department?"
          }
          isOpen={Boolean(departmentToDelete)}
          isPending={deleteMutation.isPending}
          onCancel={() => setDepartmentToDelete(null)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete Department"
          tone="danger"
        >
          {deleteMutation.error ? <p className="inline-error">{deleteMutation.error.message}</p> : null}
        </ConfirmationDialog>
      </div>
    </section>
  );
}

function OrgSummaryCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "success";
  value: number | string;
}) {
  return (
    <div className={`org-summary-card org-summary-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
