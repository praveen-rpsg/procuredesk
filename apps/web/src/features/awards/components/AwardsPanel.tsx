import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  createAward,
  deleteAward,
  listAwards,
  updateAward,
  type CaseAward,
} from "../api/awardsApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageAwards } from "../../../shared/auth/permissions";
import { formatDateOnly, toDateOnlyInputValue } from "../../../shared/utils/dateOnly";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Modal } from "../../../shared/ui/modal/Modal";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
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

const emptyAwardForm: AwardFormState = {
  notes: "",
  poAwardDate: "",
  poNumber: "",
  poValue: "",
  poValidityDate: "",
  vendorCode: "",
  vendorName: "",
};

const columns = (
  onDelete: (award: CaseAward) => void,
  onEdit: (award: CaseAward) => void,
  isDeleting: boolean,
  canManage: boolean,
): DataTableColumn<CaseAward>[] => [
  { key: "vendor", header: "Vendor", render: (row) => row.vendorName },
  { key: "code", header: "Vendor Code", render: (row) => row.vendorCode ?? "-" },
  { key: "po", header: "PO Number", render: (row) => row.poNumber ?? "-" },
  {
    key: "value",
    header: "PO Value [All Inclusive]",
    render: (row) => formatMoney(row.poValue),
  },
  { key: "awardDate", header: "Award Date", render: (row) => formatDateOnly(row.poAwardDate) },
  { key: "validity", header: "Validity", render: (row) => formatDateOnly(row.poValidityDate) },
  {
    key: "actions",
    header: "",
    render: (row) =>
      canManage ? (
      <div className="row-actions">
        <Button variant="secondary" onClick={() => onEdit(row)} title="Edit award">
          <Pencil size={16} />
        </Button>
        <Button
          disabled={isDeleting}
          onClick={() => onDelete(row)}
          title="Delete award"
          variant="danger"
        >
          <Trash2 size={16} />
        </Button>
      </div>
      ) : (
        "-"
      ),
  },
];

type AwardsPanelProps = {
  caseId: string | null;
  isCaseCompleted?: boolean;
};

export function AwardsPanel({ caseId, isCaseCompleted = false }: AwardsPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const hasAwardPermission = canManageAwards(user);
  const canManage = hasAwardPermission && isCaseCompleted;
  const [form, setForm] = useState<AwardFormState>(emptyAwardForm);
  const [editingAward, setEditingAward] = useState<CaseAward | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<CaseAward | null>(null);

  const awards = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => listAwards(caseId as string),
    queryKey: ["awards", caseId],
  });

  useEffect(() => {
    if (!editingAward) {
      setForm(emptyAwardForm);
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
      setForm(emptyAwardForm);
      await refreshCase();
      notify({ message: "Award added.", tone: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateAward(caseId as string, editingAward?.id as string, awardPayload(form)),
    onSuccess: async () => {
      setEditingAward(null);
      setForm(emptyAwardForm);
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    if (!caseId || !form.vendorName.trim()) return;
    if (editingAward) {
      updateMutation.mutate();
      return;
    }
    createMutation.mutate();
  };

  if (!caseId) {
    return (
      <section className="state-panel state-panel-error case-detail-grid-wide">
        <h2>Awards</h2>
        <p>Select a case before managing awards.</p>
      </section>
    );
  }

  return (
    <section className="state-panel case-detail-grid-wide">
      <div className="detail-header">
        <div>
          <p className="eyebrow">RC/PO</p>
          <h2>Awards</h2>
        </div>
      </div>

      {canManage ? (
      <form className="award-form award-form-expanded" onSubmit={onSubmit}>
        <FormField label="Vendor">
          <TextInput
            maxLength={500}
            onChange={(event) => setFormValue(setForm, "vendorName", event.target.value)}
            required
            value={form.vendorName}
          />
        </FormField>
        <FormField label="Vendor Code">
          <TextInput
            maxLength={100}
            onChange={(event) => setFormValue(setForm, "vendorCode", event.target.value)}
            value={form.vendorCode}
          />
        </FormField>
        <FormField label="PO Number">
          <TextInput
            maxLength={200}
            onChange={(event) => setFormValue(setForm, "poNumber", event.target.value)}
            value={form.poNumber}
          />
        </FormField>
        <FormField label="PO Value (Rs.) [All Inclusive]">
          <TextInput
            min="0"
            onChange={(event) => setFormValue(setForm, "poValue", event.target.value)}
            step="0.01"
            type="number"
            value={form.poValue}
          />
        </FormField>
        <FormField label="Award Date">
          <TextInput
            onChange={(event) => setFormValue(setForm, "poAwardDate", event.target.value)}
            type="date"
            value={form.poAwardDate}
          />
        </FormField>
        <FormField label="Validity Date">
          <TextInput
            onChange={(event) => setFormValue(setForm, "poValidityDate", event.target.value)}
            type="date"
            value={form.poValidityDate}
          />
        </FormField>
        <FormField label="Notes">
          <TextInput
            maxLength={5000}
            onChange={(event) => setFormValue(setForm, "notes", event.target.value)}
            value={form.notes}
          />
        </FormField>
        <div className="form-action-inline">
          <Button disabled={createMutation.isPending || updateMutation.isPending} type="submit">
            {editingAward ? "Save Award" : "Add Award"}
          </Button>
          {editingAward ? (
            <Button variant="ghost" onClick={() => setEditingAward(null)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      ) : !isCaseCompleted ? (
        <p className="hero-copy">Awards can be managed after the case is completed.</p>
      ) : (
        <p className="hero-copy">Awards are read-only for your role.</p>
      )}

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
          columns={columns(setDeleteCandidate, setEditingAward, deleteMutation.isPending, canManage)}
          emptyMessage="No awards added."
          getRowKey={(row) => row.id}
          rows={awards.data ?? []}
        />
      )}

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
    notes: form.notes || null,
    poAwardDate: form.poAwardDate || null,
    poNumber: form.poNumber || null,
    poValue: form.poValue ? Number(form.poValue) : null,
    poValidityDate: form.poValidityDate || null,
    vendorCode: form.vendorCode || null,
    vendorName: form.vendorName,
  };
}

function formatMoney(value: number | null) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function setFormValue(
  setForm: Dispatch<SetStateAction<AwardFormState>>,
  key: keyof AwardFormState,
  value: string,
) {
  setForm((current) => ({ ...current, [key]: value }));
}
