import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, TimerReset, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createTenderType,
  deleteTenderType,
  getCatalogSnapshot,
  updateTenderType,
  type TenderTypeRule,
} from "../api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageCatalog } from "../../../shared/auth/permissions";
import { Badge } from "../../../shared/ui/badge/Badge";
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

type TenderTypeFormState = {
  completionDays: string;
  isActive: boolean;
  name: string;
  requiresFullMilestoneForm: boolean;
};

const emptyForm: TenderTypeFormState = {
  completionDays: "0",
  isActive: true,
  name: "",
  requiresFullMilestoneForm: false,
};

const tenderTypeColumns = (
  onDelete: (tenderType: TenderTypeRule) => void,
  onEdit: (rule: TenderTypeRule) => void,
  canManage: boolean,
): DataTableColumn<TenderTypeRule>[] => [
  {
    key: "name",
    header: "Tender Type",
    render: (row) => (
      <div className="tender-type-name-cell">
        <strong>{row.name}</strong>
        <span>{row.requiresFullMilestoneForm ? "Full milestone workflow" : "Basic milestone workflow"}</span>
      </div>
    ),
  },
  {
    key: "days",
    header: "Completion Days",
    render: (row) => (
      <div className="tender-type-days-cell">
        <strong>{row.completionDays ?? "-"}</strong>
        <span>{row.completionDays === null ? "No default rule" : `PR date + ${row.completionDays} days`}</span>
      </div>
    ),
  },
  {
    key: "milestones",
    header: "Milestones",
    render: (row) => (row.requiresFullMilestoneForm ? "Full" : "Basic"),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusBadge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Active" : "Inactive"}
      </StatusBadge>
    ),
  },
  { key: "tenders", header: "Tenders", render: (row) => row.usageCount },
  {
    key: "action",
    header: "Actions",
    render: (row) =>
      canManage ? (
      <div className="row-actions">
        <IconButton
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
          tooltip="Edit tender type"
        >
          <Pencil size={17} />
        </IconButton>
        <IconButton
          aria-label={`Delete ${row.name}`}
          disabled={row.usageCount > 0}
          onClick={() => onDelete(row)}
          tooltip={
            row.usageCount > 0
              ? "Tender type has tenders and cannot be deleted"
              : "Delete tender type"
          }
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

export function TenderTypeDaysAdminPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageCatalog(user);
  const catalog = useQuery({ queryFn: getCatalogSnapshot, queryKey: ["catalog-snapshot"] });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTenderTypeId, setSelectedTenderTypeId] = useState("");
  const [tenderTypeToDelete, setTenderTypeToDelete] = useState<TenderTypeRule | null>(null);
  const [newTenderType, setNewTenderType] = useState<TenderTypeFormState>(emptyForm);
  const [editTenderType, setEditTenderType] = useState<TenderTypeFormState>(emptyForm);

  const selectedTenderType = useMemo(
    () => catalog.data?.tenderTypes.find((tenderType) => tenderType.id === selectedTenderTypeId) ?? null,
    [catalog.data?.tenderTypes, selectedTenderTypeId],
  );
  const tenderTypeSummary = useMemo(() => {
    const tenderTypes = catalog.data?.tenderTypes ?? [];
    return {
      activeCount: tenderTypes.filter((tenderType) => tenderType.isActive).length,
      configuredCount: tenderTypes.filter((tenderType) => tenderType.completionDays !== null).length,
      fullMilestoneCount: tenderTypes.filter((tenderType) => tenderType.requiresFullMilestoneForm).length,
    };
  }, [catalog.data?.tenderTypes]);

  useEffect(() => {
    if (selectedTenderType) {
      setEditTenderType({
        completionDays: selectedTenderType.completionDays?.toString() ?? "0",
        isActive: selectedTenderType.isActive,
        name: selectedTenderType.name,
        requiresFullMilestoneForm: selectedTenderType.requiresFullMilestoneForm,
      });
    }
  }, [selectedTenderType]);

  const createMutation = useMutation({
    mutationFn: () =>
      createTenderType({
        completionDays: Number(newTenderType.completionDays),
        name: newTenderType.name,
        requiresFullMilestoneForm: newTenderType.requiresFullMilestoneForm,
      }),
    onSuccess: async (result) => {
      setNewTenderType(emptyForm);
      setSelectedTenderTypeId(result.id);
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Tender type created.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateTenderType(selectedTenderTypeId, {
        completionDays: Number(editTenderType.completionDays),
        isActive: editTenderType.isActive,
        name: editTenderType.name,
        requiresFullMilestoneForm: editTenderType.requiresFullMilestoneForm,
      }),
    onSuccess: async () => {
      setIsEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Tender type saved.", tone: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTenderType(tenderTypeToDelete?.id ?? ""),
    onSuccess: async () => {
      setTenderTypeToDelete(null);
      setSelectedTenderTypeId("");
      await queryClient.invalidateQueries({ queryKey: ["catalog-snapshot"] });
      notify({ message: "Tender type deleted.", tone: "success" });
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

  const openEdit = (rule: TenderTypeRule) => {
    setSelectedTenderTypeId(rule.id);
    setEditTenderType({
      completionDays: rule.completionDays?.toString() ?? "0",
      isActive: rule.isActive,
      name: rule.name,
      requiresFullMilestoneForm: rule.requiresFullMilestoneForm,
    });
    setIsEditOpen(true);
  };

  return (
    <section className="admin-section">
      <PageHeader
        actions={
          canManage ? (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus size={18} />
            New Tender Type
          </Button>
          ) : null
        }
        eyebrow="Admin"
        title="Tender Types"
      >
        Manage tender type choices, completion targets, and milestone behavior.
      </PageHeader>

      <div className="admin-stack">
        <section className="tender-type-rule-band">
          <div className="tender-type-rule-copy">
            <span className="admin-section-nav-icon">
              <TimerReset size={18} />
            </span>
            <div>
              <p className="eyebrow">Target Date Rule</p>
              <h2>Tentative Completion Date</h2>
              <p>
                <strong>PR Receipt Date</strong>
                <span>+</span>
                <strong>Completion Days</strong>
              </p>
            </div>
          </div>
          <div className="tender-type-rule-metrics" aria-label="Tender type rule summary">
            <div>
              <strong>{tenderTypeSummary.activeCount}</strong>
              <span>Active types</span>
            </div>
            <div>
              <strong>{tenderTypeSummary.configuredCount}</strong>
              <span>Rules set</span>
            </div>
            <div>
              <strong>{tenderTypeSummary.fullMilestoneCount}</strong>
              <span>Full workflows</span>
            </div>
          </div>
        </section>

        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Rules</p>
              <h2>Tender Type Directory</h2>
            </div>
            <Badge tone="neutral">{catalog.data?.tenderTypes.length ?? 0} total</Badge>
          </div>
          {catalog.isLoading ? (
            <Skeleton height={20} />
          ) : catalog.error ? (
            <p className="inline-error">{catalog.error.message}</p>
          ) : (catalog.data?.tenderTypes ?? []).length > 0 ? (
            <DataTable
              columns={tenderTypeColumns(setTenderTypeToDelete, openEdit, canManage)}
              emptyMessage="No tender types found."
              getRowKey={(row) => row.id}
              rows={catalog.data?.tenderTypes ?? []}
            />
          ) : (
            <EmptyState title="No tender types">
              <CalendarClock size={18} />
            </EmptyState>
          )}
        </section>

        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Tender Type">
          <TenderTypeForm
            errorMessage={createMutation.error?.message}
            form={newTenderType}
            isPending={createMutation.isPending}
            onCancel={() => setIsCreateOpen(false)}
            onChange={setNewTenderType}
            onSubmit={onCreate}
            submitLabel="Create Tender Type"
          />
        </Modal>

        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title={selectedTenderType ? selectedTenderType.name : "Edit Tender Type"}
        >
          <TenderTypeForm
            errorMessage={updateMutation.error?.message}
            form={editTenderType}
            isDisabled={!selectedTenderType}
            isPending={updateMutation.isPending}
            onCancel={() => setIsEditOpen(false)}
            onChange={setEditTenderType}
            onSubmit={onUpdate}
            showStatus
            submitLabel="Save Tender Type"
          />
        </Modal>

        <ConfirmationDialog
          confirmLabel="Delete Tender Type"
          description={
            tenderTypeToDelete
              ? `Delete ${tenderTypeToDelete.name}? It will be removed from future case form choices.`
              : "Delete this tender type?"
          }
          isPending={deleteMutation.isPending}
          isOpen={Boolean(tenderTypeToDelete)}
          onCancel={() => setTenderTypeToDelete(null)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete Tender Type"
          tone="danger"
        >
          {deleteMutation.error ? (
            <p className="inline-error">{deleteMutation.error.message}</p>
          ) : null}
        </ConfirmationDialog>
      </div>
    </section>
  );
}

function TenderTypeForm({
  errorMessage,
  form,
  isDisabled = false,
  isPending,
  onCancel,
  onChange,
  onSubmit,
  showStatus = false,
  submitLabel,
}: {
  errorMessage?: string | undefined;
  form: TenderTypeFormState;
  isDisabled?: boolean;
  isPending: boolean;
  onCancel: () => void;
  onChange: (value: TenderTypeFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  showStatus?: boolean;
  submitLabel: string;
}) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <FormField label="Tender Type Name">
        <TextInput
          disabled={isDisabled}
          maxLength={200}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
          value={form.name}
        />
      </FormField>
      <FormField
        helperText="Tentative completion date defaults to PR receipt date plus this value."
        label="Completion Days"
      >
        <TextInput
          disabled={isDisabled}
          min={0}
          onChange={(event) => onChange({ ...form, completionDays: event.target.value })}
          required
          type="number"
          value={form.completionDays}
        />
      </FormField>
      <label className="checkbox-row">
        <input
          checked={form.requiresFullMilestoneForm}
          disabled={isDisabled}
          onChange={(event) =>
            onChange({ ...form, requiresFullMilestoneForm: event.target.checked })
          }
          type="checkbox"
        />
        Require full milestone workflow
      </label>
      {showStatus ? (
        <label className="checkbox-row">
          <input
            checked={form.isActive}
            disabled={isDisabled}
            onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
            type="checkbox"
          />
          Active
        </label>
      ) : null}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button disabled={isDisabled || isPending} type="submit">
          {submitLabel}
        </Button>
      </div>
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
    </form>
  );
}
