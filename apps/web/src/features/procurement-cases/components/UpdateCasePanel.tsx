import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { listAssignableOwners } from "../../admin/api/adminApi";
import {
  assignCaseOwner,
  getCase,
  updateCase,
  updateDelay,
  updateMilestones,
  type CaseDetail,
} from "../api/casesApi";
import { ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canAssignCaseOwner,
  canManageCaseDelay,
  canUpdateCase,
} from "../../../shared/auth/permissions";
import { isDateOnlyString, toDateOnlyInputValue } from "../../../shared/utils/dateOnly";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Select } from "../../../shared/ui/form/Select";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type UpdateCasePanelProps = {
  caseId: string | null;
};

type MilestoneFormState = {
  bidReceiptDate: string;
  biddersParticipated: string;
  commercialEvaluationDate: string;
  loiIssued: boolean;
  loiIssuedDate: string;
  nfaApprovalDate: string;
  nfaSubmissionDate: string;
  nitApprovalDate: string;
  nitInitiationDate: string;
  nitPublishDate: string;
  qualifiedBidders: string;
  rcPoAwardDate: string;
  rcPoValidity: string;
  technicalEvaluationDate: string;
};

type DateMilestoneKey = Exclude<
  keyof MilestoneFormState,
  "biddersParticipated" | "loiIssued" | "qualifiedBidders"
>;
type MilestoneErrors = Partial<Record<keyof MilestoneFormState, string>>;
type CaseFormErrors = Partial<
  Record<"approvedAmount" | "tenderName" | "tenderNo", string>
>;
type DelayFormErrors = Partial<
  Record<"delayExternalDays" | "delayReason", string>
>;

const emptyMilestones: MilestoneFormState = {
  bidReceiptDate: "",
  biddersParticipated: "",
  commercialEvaluationDate: "",
  loiIssued: false,
  loiIssuedDate: "",
  nfaApprovalDate: "",
  nfaSubmissionDate: "",
  nitApprovalDate: "",
  nitInitiationDate: "",
  nitPublishDate: "",
  qualifiedBidders: "",
  rcPoAwardDate: "",
  rcPoValidity: "",
  technicalEvaluationDate: "",
};

export function UpdateCasePanel({ caseId }: UpdateCasePanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const [approvedAmount, setApprovedAmount] = useState("");
  const [estimateBenchmark, setEstimateBenchmark] = useState("");
  const [tenderName, setTenderName] = useState("");
  const [tenderNo, setTenderNo] = useState("");
  const [priorityCase, setPriorityCase] = useState(false);
  const [milestones, setMilestones] =
    useState<MilestoneFormState>(emptyMilestones);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [showCaseErrors, setShowCaseErrors] = useState(false);
  const [showDelayErrors, setShowDelayErrors] = useState(false);
  const [showMilestoneErrors, setShowMilestoneErrors] = useState(false);
  const [delayExternalDays, setDelayExternalDays] = useState("");
  const [delayReason, setDelayReason] = useState("");

  const detail = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => getCase(caseId as string),
    queryKey: ["case", caseId],
  });
  const canEditCase = Boolean(detail.data && canUpdateCase(user, detail.data));
  const canEditDelay = Boolean(
    detail.data && canManageCaseDelay(user, detail.data),
  );
  const canReassignOwner = Boolean(
    detail.data && canAssignCaseOwner(user, detail.data),
  );
  const assignableOwners = useQuery({
    enabled: Boolean(detail.data?.entityId) && canReassignOwner,
    queryFn: () => listAssignableOwners(detail.data?.entityId as string),
    queryKey: ["case-update-assignable-owners", detail.data?.entityId],
  });

  useEffect(() => {
    if (!detail.data) return;
    const kase = detail.data;
    setApprovedAmount(moneyString(kase.financials.approvedAmount));
    setEstimateBenchmark(moneyString(kase.financials.estimateBenchmark));
    setTenderName(kase.tenderName ?? "");
    setTenderNo(kase.tenderNo ?? "");
    setPriorityCase(kase.priorityCase);
    setOwnerUserId(kase.ownerUserId ?? "");
    setMilestones({
      bidReceiptDate: milestoneString(kase.milestones.bidReceiptDate),
      biddersParticipated: numberString(kase.milestones.biddersParticipated),
      commercialEvaluationDate: milestoneString(
        kase.milestones.commercialEvaluationDate,
      ),
      loiIssued: Boolean(kase.milestones.loiIssued),
      loiIssuedDate: milestoneString(kase.milestones.loiIssuedDate),
      nfaApprovalDate: milestoneString(kase.milestones.nfaApprovalDate),
      nfaSubmissionDate: milestoneString(kase.milestones.nfaSubmissionDate),
      nitApprovalDate: milestoneString(kase.milestones.nitApprovalDate),
      nitInitiationDate: milestoneString(kase.milestones.nitInitiationDate),
      nitPublishDate: milestoneString(kase.milestones.nitPublishDate),
      qualifiedBidders: numberString(kase.milestones.qualifiedBidders),
      rcPoAwardDate: milestoneString(kase.milestones.rcPoAwardDate),
      rcPoValidity: milestoneString(kase.milestones.rcPoValidity),
      technicalEvaluationDate: milestoneString(
        kase.milestones.technicalEvaluationDate,
      ),
    });
    setDelayExternalDays(numberString(kase.delay.delayExternalDays));
    setDelayReason(kase.delay.delayReason ?? "");
    setEstimateBenchmark(moneyString(kase.financials.estimateBenchmark));
    setShowCaseErrors(false);
    setShowDelayErrors(false);
    setShowMilestoneErrors(false);
  }, [detail.data]);

  const milestoneErrors = useMemo(
    () => validateMilestones(milestones, detail.data?.prReceiptDate),
    [detail.data?.prReceiptDate, milestones],
  );
  const caseErrors = useMemo(
    () =>
      validateCaseForm({
        approvedAmount,
        milestones,
        tenderName,
        tenderNo,
      }),
    [approvedAmount, milestones, tenderName, tenderNo],
  );
  const delayErrors = useMemo(
    () => validateDelayForm({ delayExternalDays, delayReason }),
    [delayExternalDays, delayReason],
  );
  const visibleCaseErrors: CaseFormErrors = showCaseErrors ? caseErrors : {};
  const visibleDelayErrors: DelayFormErrors = showDelayErrors
    ? delayErrors
    : {};
  const ownerOptions = useMemo(() => {
    const options = (assignableOwners.data ?? []).map((owner) => ({
      label: `${owner.fullName} (${owner.email})`,
      value: owner.id,
    }));
    if (
      ownerUserId &&
      !options.some((option) => option.value === ownerUserId)
    ) {
      options.unshift({ label: "Current Owner", value: ownerUserId });
    }
    return options;
  }, [assignableOwners.data, ownerUserId]);
  const caseChangedFields = useMemo(
    () =>
      buildCaseChangedFields(detail.data, {
        approvedAmount,
        estimateBenchmark,
        priorityCase,
        tenderName,
        tenderNo,
      }),
    [
      approvedAmount,
      estimateBenchmark,
      detail.data,
      priorityCase,
      tenderName,
      tenderNo,
    ],
  );
  const delayChangedFields = useMemo(
    () =>
      buildDelayChangedFields(detail.data, { delayExternalDays, delayReason }),
    [delayExternalDays, delayReason, detail.data],
  );
  const milestoneChangedFields = useMemo(
    () => buildMilestoneChangedFields(detail.data, milestones),
    [detail.data, milestones],
  );

  const updateCaseMutation = useMutation({
    mutationFn: () =>
      updateCase(caseId as string, {
        financials:
          approvedAmount.trim() || estimateBenchmark.trim()
            ? {
                approvedAmount: approvedAmount.trim()
                  ? parseMoneyInput(approvedAmount)
                  : undefined,
                estimateBenchmark: estimateBenchmark.trim()
                  ? parseMoneyInput(estimateBenchmark)
                  : undefined,
              }
            : undefined,
        priorityCase,
        tenderName: tenderName || null,
        tenderNo: tenderNo || null,
      }),
    onSuccess: async () => {
      await invalidateCaseQueries(queryClient, caseId);
      toast.notify({ message: "Case updated.", tone: "success" });
    },
  });
  const ownerMutation = useMutation({
    mutationFn: () => assignCaseOwner(caseId as string, ownerUserId),
    onSuccess: async () => {
      await invalidateCaseQueries(queryClient, caseId);
      toast.notify({ message: "Owner updated.", tone: "success" });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: () =>
      updateMilestones(caseId as string, milestonePayload(milestones)),
    onSuccess: async () => {
      await invalidateCaseQueries(queryClient, caseId);
      toast.notify({ message: "Milestones updated.", tone: "success" });
    },
  });
  const serverChronologyErrors = useMemo(
    () => extractChronologyErrors(updateMilestoneMutation.error),
    [updateMilestoneMutation.error],
  );
  const serverMilestoneErrors = useMemo(
    () => mapChronologyErrorsToFields(serverChronologyErrors),
    [serverChronologyErrors],
  );
  const visibleMilestoneErrors: MilestoneErrors = {
    ...(showMilestoneErrors ? milestoneErrors : {}),
    ...serverMilestoneErrors,
  };

  const delayMutation = useMutation({
    mutationFn: () =>
      updateDelay(caseId as string, {
        delayExternalDays: delayExternalDays ? Number(delayExternalDays) : null,
        delayReason: delayReason || null,
      }),
    onSuccess: async () => {
      await invalidateCaseQueries(queryClient, caseId);
      toast.notify({ message: "Delay updated.", tone: "success" });
    },
  });

  function handleCaseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditCase) return;
    setShowCaseErrors(true);
    if (Object.keys(caseErrors).length > 0) return;
    if (caseId) updateCaseMutation.mutate();
  }

  function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditCase) return;
    setShowMilestoneErrors(true);
    if (requiresApprovedAmount(milestones) && !approvedAmount.trim()) {
      setShowCaseErrors(true);
    }
    if (
      requiresApprovedAmount(milestones) &&
      (!approvedAmount.trim() || caseErrors.approvedAmount)
    )
      return;
    if (Object.keys(milestoneErrors).length > 0) return;
    if (caseId) updateMilestoneMutation.mutate();
  }

  function handleDelaySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditDelay) return;
    setShowDelayErrors(true);
    if (Object.keys(delayErrors).length > 0) return;
    if (caseId) delayMutation.mutate();
  }

  function handleOwnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (caseId && canReassignOwner && ownerUserId) {
      ownerMutation.mutate();
    }
  }

  if (!caseId) {
    return null;
  }

  if (detail.isLoading) {
    return (
      <section className="state-panel">
        <Skeleton height={18} />
        <Skeleton height={18} />
      </section>
    );
  }

  if (!canEditCase && !canEditDelay && !canReassignOwner) {
    return (
      <section className="state-panel case-detail-grid-wide case-edit-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Update</p>
            <h2>Read-only case</h2>
          </div>
        </div>
        <p className="hero-copy">
          Your role can view this case, but it cannot update details,
          milestones, delay information, or ownership for this entity.
        </p>
      </section>
    );
  }

  return (
    <section className="state-panel case-detail-grid-wide case-edit-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Update</p>
          <h2>Case And Milestones</h2>
        </div>
      </div>

      <div className="update-workspace-grid">
        {canEditCase ? (
          <form
            className="stack-form case-edit-card case-edit-card-primary"
            onSubmit={handleCaseSubmit}
          >
            <p className="eyebrow">Basic Details</p>
            <FormField
              error={visibleCaseErrors.tenderName ?? ""}
              label="Tender Name"
            >
              <TextInput
                maxLength={500}
                onChange={(event) => setTenderName(event.target.value)}
                value={tenderName}
              />
            </FormField>
            <FormField
              error={visibleCaseErrors.tenderNo ?? ""}
              label="Tender No"
            >
              <TextInput
                maxLength={200}
                onChange={(event) => setTenderNo(event.target.value)}
                value={tenderNo}
              />
            </FormField>
            <FormField label="Estimate / Benchmark (Rs.)">
              <TextInput
                inputMode="decimal"
                onChange={(event) => setEstimateBenchmark(event.target.value)}
                placeholder="0"
                value={estimateBenchmark}
              />
            </FormField>
            <FormField
              error={visibleCaseErrors.approvedAmount ?? ""}
              helperText="Required before NFA approval, LOI, or RC/PO award milestones are saved."
              label="NFA Approved Amount (Rs.)"
            >
              <TextInput
                inputMode="decimal"
                onChange={(event) => setApprovedAmount(event.target.value)}
                placeholder="0"
                value={approvedAmount}
              />
            </FormField>
            <label className="checkbox-row">
              <input
                checked={priorityCase}
                onChange={(event) => setPriorityCase(event.target.checked)}
                type="checkbox"
              />
              Priority Case
            </label>
            <ChangedFields fields={caseChangedFields} />
            {updateCaseMutation.error ? (
              <div className="form-error">
                {updateCaseMutation.error.message}
              </div>
            ) : null}
            <Button disabled={updateCaseMutation.isPending} type="submit">
              Save Details
            </Button>
          </form>
        ) : null}

        {canReassignOwner ? (
          <form
            className="stack-form case-edit-card"
            onSubmit={handleOwnerSubmit}
          >
            <p className="eyebrow">Ownership And Target</p>
            <FormField
              helperText={
                canReassignOwner
                  ? "Only users mapped to the case entity are available."
                  : "Owner reassignment is locked for your role."
              }
              label="Owner"
            >
              <Select
                disabled={!canReassignOwner || assignableOwners.isLoading}
                onChange={(event) => setOwnerUserId(event.target.value)}
                options={ownerOptions}
                placeholder="No Owner"
                value={ownerUserId}
              />
            </FormField>
            <FormField
              helperText="Completion target is governed by tender type rule and is locked after intake."
              label="Completion Target"
            >
              <TextInput
                disabled
                type="date"
                value={detail.data?.tentativeCompletionDate ?? ""}
              />
            </FormField>
            {ownerMutation.error ? (
              <div className="form-error">{ownerMutation.error.message}</div>
            ) : null}
            <Button
              disabled={
                !canReassignOwner || !ownerUserId || ownerMutation.isPending
              }
              type="submit"
            >
              Save Owner
            </Button>
          </form>
        ) : null}

        {canEditDelay ? (
          <form
            className="stack-form case-edit-card"
            onSubmit={handleDelaySubmit}
          >
            <p className="eyebrow">Delay</p>
            <FormField
              error={visibleDelayErrors.delayExternalDays ?? ""}
              label="External Delay Days"
            >
              <TextInput
                min={0}
                onChange={(event) => setDelayExternalDays(event.target.value)}
                type="number"
                value={delayExternalDays}
              />
            </FormField>
            <FormField
              error={visibleDelayErrors.delayReason ?? ""}
              label="Delay Reason"
            >
              <textarea
                className="text-input text-area"
                maxLength={5000}
                onChange={(event) => setDelayReason(event.target.value)}
                value={delayReason}
              />
            </FormField>
            <ChangedFields fields={delayChangedFields} />
            {delayMutation.error ? (
              <div className="form-error">{delayMutation.error.message}</div>
            ) : null}
            <Button disabled={delayMutation.isPending} type="submit">
              Save Delay
            </Button>
          </form>
        ) : null}
      </div>

      {canEditCase ? (
        <form
          className="stack-form case-edit-card case-edit-milestones"
          onSubmit={handleMilestoneSubmit}
        >
          <div className="case-edit-section-heading">
            <div>
              <p className="eyebrow">Milestones</p>
              <h3>Procurement Timeline</h3>
            </div>
          </div>
          <div className="milestone-form-grid">
            <FormField
              helperText="Milestones must start on or after this PR receipt date."
              label="PR Receipt Date"
            >
              <TextInput
                disabled
                type="date"
                value={detail.data?.prReceiptDate ?? ""}
              />
            </FormField>
            <DateField
              error={visibleMilestoneErrors.nitInitiationDate}
              label="NIT Initiation"
              name="nitInitiationDate"
              setValue={setMilestones}
              value={milestones.nitInitiationDate}
            />
            <DateField
              error={visibleMilestoneErrors.nitApprovalDate}
              label="NIT Approval"
              name="nitApprovalDate"
              setValue={setMilestones}
              value={milestones.nitApprovalDate}
            />
            <DateField
              error={visibleMilestoneErrors.nitPublishDate}
              label="NIT Publish"
              name="nitPublishDate"
              setValue={setMilestones}
              value={milestones.nitPublishDate}
            />
            <DateField
              error={visibleMilestoneErrors.bidReceiptDate}
              label="Bid Receipt"
              name="bidReceiptDate"
              setValue={setMilestones}
              value={milestones.bidReceiptDate}
            />
            <FormField
              error={visibleMilestoneErrors.biddersParticipated ?? ""}
              label="Bidders Participated"
            >
              <TextInput
                min={0}
                onChange={(event) =>
                  setMilestones((value) => ({
                    ...value,
                    biddersParticipated: event.target.value,
                  }))
                }
                type="number"
                value={milestones.biddersParticipated}
              />
            </FormField>
            <DateField
              error={visibleMilestoneErrors.commercialEvaluationDate}
              label="Commercial Evaluation"
              name="commercialEvaluationDate"
              setValue={setMilestones}
              value={milestones.commercialEvaluationDate}
            />
            <DateField
              error={visibleMilestoneErrors.technicalEvaluationDate}
              label="Technical Evaluation"
              name="technicalEvaluationDate"
              setValue={setMilestones}
              value={milestones.technicalEvaluationDate}
            />
            <FormField
              error={visibleMilestoneErrors.qualifiedBidders ?? ""}
              label="Qualified Bidders"
            >
              <TextInput
                min={0}
                onChange={(event) =>
                  setMilestones((value) => ({
                    ...value,
                    qualifiedBidders: event.target.value,
                  }))
                }
                type="number"
                value={milestones.qualifiedBidders}
              />
            </FormField>
            <DateField
              error={visibleMilestoneErrors.nfaSubmissionDate}
              label="NFA Submission"
              name="nfaSubmissionDate"
              setValue={setMilestones}
              value={milestones.nfaSubmissionDate}
            />
            <DateField
              error={visibleMilestoneErrors.nfaApprovalDate}
              label="NFA Approval"
              name="nfaApprovalDate"
              setValue={setMilestones}
              value={milestones.nfaApprovalDate}
            />
            <label className="checkbox-row">
              <input
                checked={milestones.loiIssued}
                onChange={(event) =>
                  setMilestones((value) => ({
                    ...value,
                    loiIssued: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              LOI Issued
            </label>
            <DateField
              error={visibleMilestoneErrors.loiIssuedDate}
              label="LOI Issued Date"
              name="loiIssuedDate"
              setValue={setMilestones}
              value={milestones.loiIssuedDate}
            />
            <DateField
              error={visibleMilestoneErrors.rcPoAwardDate}
              label="RC/PO Award"
              name="rcPoAwardDate"
              setValue={setMilestones}
              value={milestones.rcPoAwardDate}
            />
            <DateField
              error={visibleMilestoneErrors.rcPoValidity}
              label="RC/PO Validity"
              name="rcPoValidity"
              setValue={setMilestones}
              value={milestones.rcPoValidity}
            />
          </div>
          {showMilestoneErrors && Object.keys(milestoneErrors).length > 0 ? (
            <div className="form-error">
              Fix the highlighted milestone fields before saving.
            </div>
          ) : null}
          <ChangedFields fields={milestoneChangedFields} />
          {serverChronologyErrors.length > 0 ? (
            <div className="form-error form-error-list">
              <div>
                <strong>Milestones could not be saved.</strong>
                <ul>
                  {serverChronologyErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : updateMilestoneMutation.error ? (
            <div className="form-error">
              {updateMilestoneMutation.error.message}
            </div>
          ) : null}
          <Button disabled={updateMilestoneMutation.isPending} type="submit">
            Save Milestones
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function DateField({
  error,
  label,
  name,
  setValue,
  value,
}: {
  error?: string | undefined;
  label: string;
  name: DateMilestoneKey;
  setValue: Dispatch<SetStateAction<MilestoneFormState>>;
  value: string;
}) {
  return (
    <FormField error={error ?? ""} label={label}>
      <TextInput
        onChange={(event) =>
          setValue((current) => ({ ...current, [name]: event.target.value }))
        }
        type="date"
        value={value}
      />
    </FormField>
  );
}

function ChangedFields({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return <p className="form-change-summary">Changed: {fields.join(", ")}</p>;
}

function buildCaseChangedFields(
  kase: CaseDetail | undefined,
  value: {
    approvedAmount: string;
    estimateBenchmark: string;
    priorityCase: boolean;
    tenderName: string;
    tenderNo: string;
  },
) {
  if (!kase) return [];
  const fields: string[] = [];
  if (value.tenderName !== (kase.tenderName ?? "")) fields.push("Tender Name");
  if (value.tenderNo !== (kase.tenderNo ?? "")) fields.push("Tender No");
  if (value.priorityCase !== kase.priorityCase) fields.push("Priority Case");
  if (
    value.approvedAmount.trim() &&
    isMoneyInput(value.approvedAmount) &&
    parseMoneyInput(value.approvedAmount) !==
      (kase.financials.approvedAmount ?? null)
  ) {
    fields.push("Approved Amount");
  }
  if (
    value.estimateBenchmark.trim() &&
    isMoneyInput(value.estimateBenchmark) &&
    parseMoneyInput(value.estimateBenchmark) !==
      (kase.financials.estimateBenchmark ?? null)
  ) {
    fields.push("Estimate / Benchmark");
  }
  return fields;
}

function buildDelayChangedFields(
  kase: CaseDetail | undefined,
  value: { delayExternalDays: string; delayReason: string },
) {
  if (!kase) return [];
  const fields: string[] = [];
  if (value.delayExternalDays !== numberString(kase.delay.delayExternalDays))
    fields.push("External Delay Days");
  if (value.delayReason !== (kase.delay.delayReason ?? ""))
    fields.push("Delay Reason");
  return fields;
}

function buildMilestoneChangedFields(
  kase: CaseDetail | undefined,
  value: MilestoneFormState,
) {
  if (!kase) return [];
  const fields: string[] = [];
  for (const key of dateMilestoneKeys) {
    if (value[key] !== milestoneString(kase.milestones[key])) {
      fields.push(milestoneLabels[key]);
    }
  }
  if (
    value.biddersParticipated !==
    numberString(kase.milestones.biddersParticipated)
  ) {
    fields.push("Bidders Participated");
  }
  if (
    value.qualifiedBidders !== numberString(kase.milestones.qualifiedBidders)
  ) {
    fields.push("Qualified Bidders");
  }
  if (value.loiIssued !== Boolean(kase.milestones.loiIssued)) {
    fields.push("LOI Issued");
  }
  return fields;
}

const milestoneLabels: Record<DateMilestoneKey, string> = {
  bidReceiptDate: "Bid Receipt",
  commercialEvaluationDate: "Commercial Evaluation",
  loiIssuedDate: "LOI Issued Date",
  nfaApprovalDate: "NFA Approval",
  nfaSubmissionDate: "NFA Submission",
  nitApprovalDate: "NIT Approval",
  nitInitiationDate: "NIT Initiation",
  nitPublishDate: "NIT Publish",
  rcPoAwardDate: "RC/PO Award",
  rcPoValidity: "RC/PO Validity",
  technicalEvaluationDate: "Technical Evaluation",
};

function validateCaseForm(input: {
  approvedAmount: string;
  milestones: MilestoneFormState;
  tenderName: string;
  tenderNo: string;
}): CaseFormErrors {
  const errors: CaseFormErrors = {};
  if (input.tenderName.length > 500) {
    errors.tenderName = "Tender name cannot exceed 500 characters.";
  }
  if (input.tenderNo.length > 200) {
    errors.tenderNo = "Tender number cannot exceed 200 characters.";
  }
  if (input.approvedAmount.trim() && !isMoneyInput(input.approvedAmount)) {
    errors.approvedAmount =
      "Approved amount must be a valid amount greater than or equal to 0.";
  }
  if (
    requiresApprovedAmount(input.milestones) &&
    !input.approvedAmount.trim()
  ) {
    errors.approvedAmount =
      "Approved amount is required before NFA approval, LOI, or RC/PO award.";
  }
  return errors;
}

function validateDelayForm(input: {
  delayExternalDays: string;
  delayReason: string;
}): DelayFormErrors {
  const errors: DelayFormErrors = {};
  if (
    input.delayExternalDays &&
    !isNonNegativeInteger(input.delayExternalDays)
  ) {
    errors.delayExternalDays =
      "External delay days must be a whole number greater than or equal to 0.";
  }
  if (input.delayReason.length > 5000) {
    errors.delayReason = "Delay reason cannot exceed 5000 characters.";
  }
  return errors;
}

function validateMilestones(
  value: MilestoneFormState,
  prReceiptDate?: string | null,
): MilestoneErrors {
  const errors: MilestoneErrors = {};
  for (const key of dateMilestoneKeys) {
    if (value[key] && !isDateOnlyString(value[key])) {
      errors[key] = "Use a valid date.";
    }
  }

  if (
    prReceiptDate &&
    isDateOnlyString(prReceiptDate) &&
    isDateOnlyString(value.nitInitiationDate) &&
    value.nitInitiationDate < prReceiptDate
  ) {
    errors.nitInitiationDate =
      "NIT Initiation cannot be before PR Receipt Date.";
  }
  requireDateOrder(
    errors,
    value,
    "nitInitiationDate",
    "nitApprovalDate",
    "NIT Approval cannot be before NIT Initiation.",
  );
  requireDateOrder(
    errors,
    value,
    "nitApprovalDate",
    "nitPublishDate",
    "NIT Publish cannot be before NIT Approval.",
  );
  requireDateOrder(
    errors,
    value,
    "nitPublishDate",
    "bidReceiptDate",
    "Bid Receipt cannot be before NIT Publish.",
  );
  requireDateOrder(
    errors,
    value,
    "bidReceiptDate",
    "technicalEvaluationDate",
    "Technical Evaluation cannot be before Bid Receipt.",
  );
  requireDateOrder(
    errors,
    value,
    "bidReceiptDate",
    "commercialEvaluationDate",
    "Commercial Evaluation cannot be before Bid Receipt.",
  );
  requireDateOrder(
    errors,
    value,
    "technicalEvaluationDate",
    "nfaSubmissionDate",
    "NFA Submission cannot be before Technical Evaluation.",
  );
  requireDateOrder(
    errors,
    value,
    "commercialEvaluationDate",
    "nfaSubmissionDate",
    "NFA Submission cannot be before Commercial Evaluation.",
  );
  requireDateOrder(
    errors,
    value,
    "nfaSubmissionDate",
    "nfaApprovalDate",
    "NFA Approval cannot be before NFA Submission.",
  );
  requireDateOrder(
    errors,
    value,
    "nfaApprovalDate",
    "loiIssuedDate",
    "LOI Issued Date cannot be before NFA Approval.",
  );
  requireDateOrder(
    errors,
    value,
    "nfaApprovalDate",
    "rcPoAwardDate",
    "RC/PO Award cannot be before NFA Approval.",
  );
  requireDateOrder(
    errors,
    value,
    "loiIssuedDate",
    "rcPoAwardDate",
    "RC/PO Award cannot be before LOI Issued Date.",
  );
  requireDateOrder(
    errors,
    value,
    "rcPoAwardDate",
    "rcPoValidity",
    "RC/PO Validity cannot be before RC/PO Award.",
  );

  if (value.loiIssued && !value.loiIssuedDate) {
    errors.loiIssuedDate =
      "LOI issued date is required when LOI is marked issued.";
  }

  validateNonNegativeInteger(
    errors,
    value.biddersParticipated,
    "biddersParticipated",
    "Bidders participated",
  );
  validateNonNegativeInteger(
    errors,
    value.qualifiedBidders,
    "qualifiedBidders",
    "Qualified bidders",
  );
  if (
    isNonNegativeInteger(value.biddersParticipated) &&
    isNonNegativeInteger(value.qualifiedBidders) &&
    Number(value.qualifiedBidders) > Number(value.biddersParticipated)
  ) {
    errors.qualifiedBidders =
      "Qualified bidders cannot exceed bidders participated.";
  }

  return errors;
}

function extractChronologyErrors(error: Error | null): string[] {
  if (!(error instanceof ApiError)) return [];
  if (!error.payload || typeof error.payload !== "object") return [];
  const chronologyErrors = (error.payload as Record<string, unknown>)
    .chronologyErrors;
  if (!Array.isArray(chronologyErrors)) return [];
  return chronologyErrors.filter(
    (value): value is string => typeof value === "string",
  );
}

function mapChronologyErrorsToFields(errors: string[]): MilestoneErrors {
  const fieldErrors: MilestoneErrors = {};
  for (const error of errors) {
    const field = fieldForChronologyError(error);
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = error;
    }
  }
  return fieldErrors;
}

function fieldForChronologyError(
  error: string,
): keyof MilestoneFormState | null {
  if (error.startsWith("NIT Initiation")) return "nitInitiationDate";
  if (error.startsWith("NIT Approval")) return "nitApprovalDate";
  if (error.startsWith("NIT Publish")) return "nitPublishDate";
  if (error.startsWith("Bid Receipt")) return "bidReceiptDate";
  if (error.startsWith("Bidders participated")) return "biddersParticipated";
  if (error.startsWith("Commercial Evaluation"))
    return "commercialEvaluationDate";
  if (error.startsWith("Technical Evaluation"))
    return "technicalEvaluationDate";
  if (error.startsWith("Commercial / Technical Evaluation"))
    return "technicalEvaluationDate";
  if (error.startsWith("Qualified bidders")) return "qualifiedBidders";
  if (error.startsWith("NFA Submission")) return "nfaSubmissionDate";
  if (error.startsWith("NFA Approval")) return "nfaApprovalDate";
  if (error.startsWith("LOI")) return "loiIssuedDate";
  if (error.startsWith("RC/PO Validity")) return "rcPoValidity";
  if (error.startsWith("RC/PO Award")) return "rcPoAwardDate";
  return null;
}

function requiresApprovedAmount(value: MilestoneFormState) {
  return Boolean(
    value.nfaApprovalDate ||
    value.loiIssued ||
    value.loiIssuedDate ||
    value.rcPoAwardDate,
  );
}

const dateMilestoneKeys: DateMilestoneKey[] = [
  "bidReceiptDate",
  "commercialEvaluationDate",
  "loiIssuedDate",
  "nfaApprovalDate",
  "nfaSubmissionDate",
  "nitApprovalDate",
  "nitInitiationDate",
  "nitPublishDate",
  "rcPoAwardDate",
  "rcPoValidity",
  "technicalEvaluationDate",
];

function requireDateOrder(
  errors: MilestoneErrors,
  value: MilestoneFormState,
  earlierKey: DateMilestoneKey,
  laterKey: DateMilestoneKey,
  message: string,
) {
  const earlierValue = value[earlierKey];
  const laterValue = value[laterKey];
  if (!isDateOnlyString(earlierValue) || !isDateOnlyString(laterValue)) return;
  if (laterValue < earlierValue) {
    errors[laterKey] = message;
  }
}

function validateNonNegativeInteger(
  errors: MilestoneErrors,
  value: string,
  key: "biddersParticipated" | "qualifiedBidders",
  label: string,
) {
  if (!value) return;
  if (!isNonNegativeInteger(value)) {
    errors[key] = `${label} must be a whole number greater than or equal to 0.`;
  }
}

function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value);
}

function isMoneyInput(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return false;
  return Number(normalized) >= 0;
}

function parseMoneyInput(value: string) {
  return Number(value.replace(/,/g, "").trim());
}

function milestonePayload(value: MilestoneFormState) {
  return {
    bidReceiptDate: value.bidReceiptDate || null,
    biddersParticipated: value.biddersParticipated
      ? Number(value.biddersParticipated)
      : null,
    commercialEvaluationDate: value.commercialEvaluationDate || null,
    loiIssued: value.loiIssued,
    loiIssuedDate: value.loiIssuedDate || null,
    nfaApprovalDate: value.nfaApprovalDate || null,
    nfaSubmissionDate: value.nfaSubmissionDate || null,
    nitApprovalDate: value.nitApprovalDate || null,
    nitInitiationDate: value.nitInitiationDate || null,
    nitPublishDate: value.nitPublishDate || null,
    qualifiedBidders: value.qualifiedBidders
      ? Number(value.qualifiedBidders)
      : null,
    rcPoAwardDate: value.rcPoAwardDate || null,
    rcPoValidity: value.rcPoValidity || null,
    technicalEvaluationDate: value.technicalEvaluationDate || null,
  };
}

function milestoneString(value: unknown) {
  return typeof value === "string" ? toDateOnlyInputValue(value) : "";
}

function numberString(value: unknown) {
  return typeof value === "number" ? String(value) : "";
}

function moneyString(value: unknown) {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
}

async function invalidateCaseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  caseId: string | null,
) {
  await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
  await queryClient.invalidateQueries({ queryKey: ["cases"] });
  await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-recent-cases"] });
  await queryClient.invalidateQueries({
    queryKey: ["dashboard-assigned-cases"],
  });
  await queryClient.invalidateQueries({
    queryKey: ["dashboard-delayed-cases"],
  });
  await queryClient.invalidateQueries({
    queryKey: ["dashboard-priority-cases"],
  });
}
