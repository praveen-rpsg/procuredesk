import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  createAward,
  deleteAward,
  listAwards,
  updateAward,
  type CaseAward,
} from "../api/awardsApi";
import { getCase, type CaseDetail } from "../../procurement-cases/api/casesApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageCaseAwards } from "../../../shared/auth/permissions";
import { formatDateOnly, isDateOnlyString, toDateOnlyInputValue } from "../../../shared/utils/dateOnly";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type AwardFormState = {
  notes: string;
  poAwardDate: string;
  poNumber: string;
  poValue: string;
  poValidityDate: string;
  vendorCode: string;
  vendorName: string;
};

type AwardFormErrors = Partial<Record<keyof AwardFormState, string>>;

const emptyAwardForm: AwardFormState = {
  notes: "",
  poAwardDate: "",
  poNumber: "",
  poValue: "",
  poValidityDate: "",
  vendorCode: "",
  vendorName: "",
};

type AwardsPanelProps = {
  caseId: string | null;
  isCaseCompleted?: boolean;
};

export function AwardsPanel({ caseId, isCaseCompleted = false }: AwardsPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const [form, setForm] = useState<AwardFormState>(emptyAwardForm);
  const [showErrors, setShowErrors] = useState(false);
  const [editingAward, setEditingAward] = useState<CaseAward | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<CaseAward | null>(null);

  const detail = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => getCase(caseId as string),
    queryKey: ["case", caseId],
  });
  const awards = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => listAwards(caseId as string),
    queryKey: ["awards", caseId],
  });

  const kase = detail.data;
  const awardRows = awards.data ?? [];
  const totalAwarded = kase?.financials.totalAwardedAmount ?? awardRows.reduce((sum, award) => sum + (award.poValue ?? 0), 0);
  const approvedAmount = kase?.financials.approvedAmount ?? null;
  const exceedsApproved = approvedAmount != null && totalAwarded > approvedAmount;
  const canManage = Boolean(kase && canManageCaseAwards(user, kase));
  const formErrors = useMemo(() => validateAwardForm(form), [form]);
  const visibleErrors = showErrors ? formErrors : {};

  useEffect(() => {
    if (!editingAward) {
      setForm(emptyAwardForm);
      setShowErrors(false);
      return;
    }
    setForm({
      notes: editingAward.notes ?? "",
      poAwardDate: toDateOnlyInputValue(editingAward.poAwardDate),
      poNumber: editingAward.poNumber ?? "",
      poValue: editingAward.poValue == null ? "" : String(editingAward.poValue),
      poValidityDate: toDateOnlyInputValue(editingAward.poValidityDate),
      vendorCode: editingAward.vendorCode ?? "",
      vendorName: editingAward.vendorName,
    });
    setShowErrors(false);
  }, [editingAward]);

  const refreshCase = async () => {
    await queryClient.invalidateQueries({ queryKey: ["awards", caseId] });
    await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-recent-cases"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-rc-po-expiry"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createAward(caseId as string, awardPayload(form)),
    onSuccess: async () => {
      closeForm();
      await refreshCase();
      notify({ message: "Award added.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateAward(caseId as string, editingAward?.id as string, awardPayload(form)),
    onSuccess: async () => {
      closeForm();
      await refreshCase();
      notify({ message: "Award saved.", tone: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (awardId: string) => deleteAward(caseId as string, awardId),
    onSuccess: async () => {
      setDeleteCandidate(null);
      await refreshCase();
      notify({ message: "Award removed.", tone: "success" });
    },
  });

  function openCreateForm() {
    setEditingAward(null);
    setForm(emptyAwardForm);
    setShowErrors(false);
    setIsFormOpen(true);
  }

  function openEditForm(award: CaseAward) {
    setEditingAward(award);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingAward(null);
    setForm(emptyAwardForm);
    setShowErrors(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !caseId) return;
    setShowErrors(true);
    if (Object.keys(formErrors).length) return;
    if (editingAward) {
      updateMutation.mutate();
      return;
    }
    createMutation.mutate();
  }

  if (!caseId) {
    return (
      <section className="state-panel state-panel-error case-detail-grid-wide">
        <h2>Award Details</h2>
        <p>Select a case before managing awards.</p>
      </section>
    );
  }

  return (
    <section className="state-panel case-detail-grid-wide award-details-panel">
      <div className="award-details-header">
        <div>
          <h2>
            <Trophy size={22} />
            Award Details
          </h2>
          <p>
            {kase?.prId ?? "Loading case"}
            {kase?.status ? <StatusBadge tone={kase.status === "completed" ? "success" : "neutral"}>{formatStatus(kase.status)}</StatusBadge> : null}
          </p>
        </div>
        <Button disabled={!canManage} onClick={openCreateForm}>
          <Plus size={16} />
          Add Award
        </Button>
      </div>

      {detail.isLoading ? (
        <Skeleton height={112} />
      ) : detail.error ? (
        <p className="inline-error">{detail.error.message}</p>
      ) : kase ? (
        <AwardSummary kase={kase} totalAwarded={totalAwarded} exceedsApproved={exceedsApproved} />
      ) : null}

      {!isCaseCompleted ? (
        <p className="hero-copy">Awards can be managed after the case is completed.</p>
      ) : !canManage ? (
        <p className="hero-copy">Awards are read-only for your role.</p>
      ) : null}

      {createMutation.error ? <p className="inline-error">{createMutation.error.message}</p> : null}
      {updateMutation.error ? <p className="inline-error">{updateMutation.error.message}</p> : null}
      {deleteMutation.error ? <p className="inline-error">{deleteMutation.error.message}</p> : null}

      {awards.isLoading ? (
        <div className="stack-form">
          <Skeleton height={18} />
          <Skeleton height={18} />
        </div>
      ) : awards.error ? (
        <p className="inline-error">{awards.error.message}</p>
      ) : (
        <DataTable
          columns={columns(setDeleteCandidate, openEditForm, deleteMutation.isPending, canManage)}
          emptyMessage="No awards added."
          getRowKey={(row) => row.id}
          rows={awardRows}
        />
      )}

      <p className="award-note">
        <strong>Note:</strong> The earliest validity date among the awards above is shown as the tender's RC/PO Validity. If no awards are entered, the manual RC/PO Validity field on the Update form remains editable.
      </p>

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        size="wide"
        title={`${editingAward ? "Edit Award" : "Add Award"} - ${kase?.prId ?? ""}`}
      >
        <form className="award-form-modal" onSubmit={onSubmit}>
          <div className="award-form-context">
            <div>
              <span>Case ID</span>
              <strong>{kase?.prId ?? "-"}</strong>
            </div>
            <div>
              <span>Tender</span>
              <strong>{kase?.tenderName || "-"}</strong>
            </div>
            <div>
              <span>Total RC/PO Awarded (Rs.)</span>
              <strong>{formatNumber(totalAwarded)}</strong>
            </div>
          </div>
          <div className="award-form-grid">
            <FormField error={visibleErrors.vendorName ?? ""} label="Vendor Name" required>
              <TextInput
                maxLength={500}
                onChange={(event) => setFormValue(setForm, "vendorName", event.target.value)}
                value={form.vendorName}
              />
            </FormField>
            <FormField error={visibleErrors.vendorCode ?? ""} label="Vendor Code">
              <TextInput
                maxLength={100}
                onChange={(event) => setFormValue(setForm, "vendorCode", event.target.value)}
                value={form.vendorCode}
              />
            </FormField>
            <FormField error={visibleErrors.poNumber ?? ""} label="RC/PO No.">
              <TextInput
                maxLength={200}
                onChange={(event) => setFormValue(setForm, "poNumber", event.target.value)}
                value={form.poNumber}
              />
            </FormField>
            <FormField error={visibleErrors.poValue ?? ""} label="RC/PO Value (Rs.) [All Inclusive]">
              <TextInput
                min="0"
                onChange={(event) => setFormValue(setForm, "poValue", event.target.value)}
                step="0.01"
                type="number"
                value={form.poValue}
              />
            </FormField>
            <FormField error={visibleErrors.poAwardDate ?? ""} label="RC/PO Award Date">
              <TextInput
                onChange={(event) => setFormValue(setForm, "poAwardDate", event.target.value)}
                type="date"
                value={form.poAwardDate}
              />
            </FormField>
            <FormField error={visibleErrors.poValidityDate ?? ""} label="RC/PO Validity Date">
              <TextInput
                onChange={(event) => setFormValue(setForm, "poValidityDate", event.target.value)}
                type="date"
                value={form.poValidityDate}
              />
            </FormField>
          </div>
          <FormField error={visibleErrors.notes ?? ""} label="Notes">
            <textarea
              className="text-input text-area"
              maxLength={5000}
              onChange={(event) => setFormValue(setForm, "notes", event.target.value)}
              value={form.notes}
            />
          </FormField>
          <div className="modal-actions">
            <Button disabled={createMutation.isPending || updateMutation.isPending} type="submit">
              {editingAward ? "Save Award" : "Add Award"}
            </Button>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title="Delete Award"
      >
        <div className="stack-form">
          <p className="hero-copy">{deleteCandidate?.vendorName ?? "Selected award"}</p>
          <div className="row-actions">
            <Button variant="ghost" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteCandidate) deleteMutation.mutate(deleteCandidate.id);
              }}
              variant="danger"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function AwardSummary({
  exceedsApproved,
  kase,
  totalAwarded,
}: {
  exceedsApproved: boolean;
  kase: CaseDetail;
  totalAwarded: number;
}) {
  return (
    <div className="award-summary-strip">
      <div>
        <span>Tender Name</span>
        <strong>{kase.tenderName || "-"}</strong>
      </div>
      <div>
        <span>PR Description</span>
        <strong>{kase.prDescription || "-"}</strong>
      </div>
      <div>
        <span>NFA Approved Amount (Rs.)</span>
        <strong>{formatNumber(kase.financials.approvedAmount)}</strong>
      </div>
      <div className={exceedsApproved ? "award-summary-danger" : ""}>
        <span>Total RC/PO Awarded (Rs.)</span>
        <strong>{formatNumber(totalAwarded)}</strong>
        {exceedsApproved ? <small>Exceeds approved amount</small> : null}
      </div>
    </div>
  );
}

function columns(
  onDelete: (award: CaseAward) => void,
  onEdit: (award: CaseAward) => void,
  isDeleting: boolean,
  canManage: boolean,
): DataTableColumn<CaseAward>[] {
  return [
    { enableFilter: false, enableSort: false, key: "vendor", header: "Vendor Name", render: (row) => row.vendorName },
    { enableFilter: false, enableSort: false, key: "code", header: "Vendor Code", render: (row) => row.vendorCode ?? "-" },
    { enableFilter: false, enableSort: false, key: "po", header: "RC/PO No.", render: (row) => row.poNumber ?? "-" },
    {
      enableFilter: false,
      enableSort: false,
      key: "value",
      header: "RC/PO Value (Rs.) [All Inclusive]",
      render: (row) => formatNumber(row.poValue),
    },
    { enableFilter: false, enableSort: false, key: "awardDate", header: "Award Date", render: (row) => formatDateOnly(row.poAwardDate) },
    { enableFilter: false, enableSort: false, key: "validity", header: "Validity Date", render: (row) => formatDateOnly(row.poValidityDate) },
    {
      enableFilter: false,
      enableSort: false,
      key: "actions",
      header: "",
      render: (row) =>
        canManage ? (
          <div className="row-actions">
            <IconButton aria-label={`Edit award for ${row.vendorName}`} onClick={() => onEdit(row)} tooltip="Edit award">
              <Pencil size={16} />
            </IconButton>
            <IconButton
              aria-label={`Delete award for ${row.vendorName}`}
              disabled={isDeleting}
              onClick={() => onDelete(row)}
              tooltip="Delete award"
              variant="danger"
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        ) : (
          "-"
        ),
    },
  ];
}

function awardPayload(form: AwardFormState): {
  notes: string | null;
  poAwardDate: string | null;
  poNumber: string | null;
  poValue: number | null;
  poValidityDate: string | null;
  vendorCode: string | null;
  vendorName: string;
} {
  return {
    notes: form.notes.trim() || null,
    poAwardDate: form.poAwardDate || null,
    poNumber: form.poNumber.trim() || null,
    poValue: form.poValue ? Number(form.poValue) : null,
    poValidityDate: form.poValidityDate || null,
    vendorCode: form.vendorCode.trim() || null,
    vendorName: form.vendorName.trim(),
  };
}

function validateAwardForm(form: AwardFormState): AwardFormErrors {
  const errors: AwardFormErrors = {};
  const value = form.poValue.trim();
  if (!form.vendorName.trim()) errors.vendorName = "Vendor Name is required.";
  if (value && !/^\d+(\.\d{1,2})?$/.test(value)) {
    errors.poValue = "Use a non-negative amount with up to two decimals.";
  }
  if (form.poAwardDate && !isDateOnlyString(form.poAwardDate)) {
    errors.poAwardDate = "Use a valid award date.";
  }
  if (form.poValidityDate && !isDateOnlyString(form.poValidityDate)) {
    errors.poValidityDate = "Use a valid validity date.";
  }
  if (form.poAwardDate && form.poValidityDate && form.poValidityDate < form.poAwardDate) {
    errors.poValidityDate = "RC/PO Validity Date cannot be before RC/PO Award Date.";
  }
  if (form.notes.length > 5000) errors.notes = "Notes cannot exceed 5000 characters.";
  return errors;
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function setFormValue(
  setForm: Dispatch<SetStateAction<AwardFormState>>,
  key: keyof AwardFormState,
  value: string,
) {
  setForm((current) => ({ ...current, [key]: value }));
}
