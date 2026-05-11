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
  Record<"tenderName" | "tenderNo" | "tmRemarks", string>
>;
type FinancialFormErrors = Partial<
  Record<"approvedAmount" | "estimateBenchmark", string>
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
  const [tmRemarks, setTmRemarks] = useState("");
  const [priorityCase, setPriorityCase] = useState(false);
  const [milestones, setMilestones] =
    useState<MilestoneFormState>(emptyMilestones);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [tentativeCompletionDate, setTentativeCompletionDate] = useState("");
  const [showCaseErrors, setShowCaseErrors] = useState(false);
  const [showDelayErrors, setShowDelayErrors] = useState(false);
  const [showFinancialErrors, setShowFinancialErrors] = useState(false);
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
    setTmRemarks(kase.tmRemarks ?? "");
    setPriorityCase(kase.priorityCase);
    setOwnerUserId(kase.ownerUserId ?? "");
    setTentativeCompletionDate(milestoneString(kase.tentativeCompletionDate));
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
    setShowFinancialErrors(false);
    setShowMilestoneErrors(false);
  }, [detail.data]);

  const milestoneErrors = useMemo(
    () =>
      validateMilestones({
        estimateBenchmark,
        milestones,
        prReceiptDate: detail.data?.prReceiptDate ?? null,
      }),
    [detail.data?.prReceiptDate, estimateBenchmark, milestones],
  );
  const caseErrors = useMemo(
    () =>
      validateCaseForm({
        tenderName,
        tenderNo,
        tmRemarks,
      }),
    [tenderName, tenderNo, tmRemarks],
  );
  const financialErrors = useMemo(
    () =>
      validateFinancialForm({
        approvedAmount,
        estimateBenchmark,
        milestones,
      }),
    [approvedAmount, estimateBenchmark, milestones],
  );
  const delayErrors = useMemo(
    () => validateDelayForm({ delayExternalDays, delayReason }),
    [delayExternalDays, delayReason],
  );
  const visibleCaseErrors: CaseFormErrors = showCaseErrors ? caseErrors : {};
  const visibleFinancialErrors: FinancialFormErrors = showFinancialErrors
    ? financialErrors
    : {};
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
        priorityCase,
        tenderName,
        tenderNo,
        tmRemarks,
      }),
    [
      detail.data,
      priorityCase,
      tenderName,
      tenderNo,
      tmRemarks,
    ],
  );
  const financialChangedFields = useMemo(
    () =>
      buildFinancialChangedFields(detail.data, {
        approvedAmount,
        estimateBenchmark,
      }),
    [approvedAmount, estimateBenchmark, detail.data],
  );
  const delayChangedFields = useMemo(
    () =>
      buildDelayChangedFields(detail.data, { delayExternalDays, delayReason }),
    [delayExternalDays, delayReason, detail.data],
  );
  const ownerChanged = Boolean(
    canReassignOwner && detail.data && ownerUserId && ownerUserId !== (detail.data.ownerUserId ?? ""),
  );
  const tentativeCompletionChanged = Boolean(
    canReassignOwner &&
      detail.data &&
      tentativeCompletionDate &&
      tentativeCompletionDate !== milestoneString(detail.data.tentativeCompletionDate),
  );
  const milestoneChangedFields = useMemo(
    () => buildMilestoneChangedFields(detail.data, milestones),
    [detail.data, milestones],
  );

  const saveCaseMutation = useMutation({
    mutationFn: async () => {
      const targetCaseId = caseId as string;

      if (canEditCase) {
        const financials = financialPayload({
          approvedAmount,
          estimateBenchmark,
        });
        await updateCase(targetCaseId, {
          financials: financials ?? undefined,
          priorityCase,
          tenderName: tenderName || null,
          tenderNo: tenderNo || null,
          tentativeCompletionDate: tentativeCompletionChanged
            ? tentativeCompletionDate
            : undefined,
          tmRemarks: tmRemarks || null,
        });
        await updateMilestones(targetCaseId, milestonePayload(milestones));
      }

      if (canReassignOwner && ownerUserId && ownerChanged) {
        await assignCaseOwner(targetCaseId, ownerUserId);
      }

      if (canEditDelay) {
        await updateDelay(targetCaseId, {
          delayExternalDays: delayExternalDays ? Number(delayExternalDays) : null,
          delayReason: delayReason || null,
        });
      }
    },
    onSuccess: async () => {
      await invalidateCaseQueries(queryClient, caseId);
      toast.notify({ message: "Case saved.", tone: "success" });
    },
  });
  const serverChronologyErrors = useMemo(
    () => extractChronologyErrors(saveCaseMutation.error),
    [saveCaseMutation.error],
  );
  const serverMilestoneErrors = useMemo(
    () => mapChronologyErrorsToFields(serverChronologyErrors),
    [serverChronologyErrors],
  );
  const visibleMilestoneErrors: MilestoneErrors = {
    ...(showMilestoneErrors ? milestoneErrors : {}),
    ...serverMilestoneErrors,
  };

  function handleSaveAll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!caseId) return;
    if (canEditCase) {
      setShowCaseErrors(true);
      setShowFinancialErrors(true);
      setShowMilestoneErrors(true);
    }
    if (canEditDelay) {
      setShowDelayErrors(true);
    }

    if (canEditCase && Object.keys(caseErrors).length > 0) return;
    if (canEditCase && Object.keys(financialErrors).length > 0) return;
    if (canEditCase && Object.keys(milestoneErrors).length > 0) return;
    if (canEditDelay && Object.keys(delayErrors).length > 0) return;

    saveCaseMutation.mutate();
  }
  const hasVisibleChanges =
    caseChangedFields.length > 0 ||
    financialChangedFields.length > 0 ||
    milestoneChangedFields.length > 0 ||
    delayChangedFields.length > 0 ||
    ownerChanged ||
    tentativeCompletionChanged;

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

      <form className="stack-form" onSubmit={handleSaveAll}>
      <div className="update-workspace-grid">
        {canEditCase ? (
          <section
            className="stack-form case-edit-card case-edit-card-primary"
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
            <FormField
              error={visibleCaseErrors.tmRemarks ?? ""}
              label="Tender Owner's Remarks"
            >
              <textarea
                className="text-input text-area"
                maxLength={5000}
                onChange={(event) => setTmRemarks(event.target.value)}
                value={tmRemarks}
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
          </section>
        ) : null}

        {canReassignOwner ? (
          <section
            className="stack-form case-edit-card"
          >
            <p className="eyebrow">Ownership And Target</p>
            <FormField
              helperText={
                canReassignOwner
                  ? "Editable only by entity-level users. Only users mapped to the case entity are available."
                  : "Tender owner is locked for your role."
              }
              label="Tender Owner"
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
              helperText="Editable only by entity-level users mapped to this case entity."
              label="Tentative Completion Date"
            >
              <TextInput
                disabled={!canReassignOwner}
                onChange={(event) => setTentativeCompletionDate(event.target.value)}
                type="date"
                value={tentativeCompletionDate}
              />
            </FormField>
            <ChangedFields
              fields={[
                ...(ownerChanged ? ["Tender Owner"] : []),
                ...(tentativeCompletionChanged ? ["Tentative Completion Date"] : []),
              ]}
            />
          </section>
        ) : null}

        {canEditDelay ? (
          <section
            className="stack-form case-edit-card"
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
          </section>
        ) : null}
      </div>

      {canEditCase ? (
        <section
          className="stack-form case-edit-card case-edit-milestones"
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
                value={milestoneString(detail.data?.prReceiptDate)}
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
            <FormField
              error={visibleFinancialErrors.estimateBenchmark ?? ""}
              label="Estimate / Benchmark (Rs.) [All Inclusive]"
            >
              <TextInput
                inputMode="decimal"
                onChange={(event) => setEstimateBenchmark(event.target.value)}
                placeholder="0"
                value={estimateBenchmark}
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
            <FormField
              error={visibleFinancialErrors.approvedAmount ?? ""}
              helperText="Required before NFA approval, LOI, or RC/PO award milestones are saved."
              label="NFA Approved Amount (Rs.) [All Inclusive]"
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
                checked={milestones.loiIssued}
                onChange={(event) =>
                  setMilestones((value) => ({
                    ...value,
                    loiIssued: event.target.checked,
                    loiIssuedDate: event.target.checked
                      ? value.loiIssuedDate
                      : "",
                  }))
                }
                type="checkbox"
              />
              LOI Issued
            </label>
            {milestones.loiIssued ? (
              <DateField
                error={visibleMilestoneErrors.loiIssuedDate}
                label="LOI Issued Date"
                name="loiIssuedDate"
                setValue={setMilestones}
                value={milestones.loiIssuedDate}
              />
            ) : null}
            <DateField
              error={visibleMilestoneErrors.rcPoAwardDate}
              label="RC/PO Award"
              name="rcPoAwardDate"
              setValue={setMilestones}
              value={milestones.rcPoAwardDate}
            />
            <DateField
              error={visibleMilestoneErrors.rcPoValidity}
              helperText="Auto-filled from the earliest Award Page validity date; edit here when needed."
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
          <ChangedFields
            fields={[...financialChangedFields, ...milestoneChangedFields]}
          />
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
          ) : null}
        </section>
      ) : null}
      {saveCaseMutation.error && serverChronologyErrors.length === 0 ? (
        <div className="form-error">{saveCaseMutation.error.message}</div>
      ) : null}
      <div className="case-edit-save-bar">
        <div>
          <strong>{hasVisibleChanges ? "Unsaved changes" : "No unsaved changes"}</strong>
          <span>
            {hasVisibleChanges
              ? "Review all sections, then save once."
              : "Changes across details, owner, delay, and milestones will appear here."}
          </span>
        </div>
        <Button disabled={saveCaseMutation.isPending || !hasVisibleChanges} type="submit">
          {saveCaseMutation.isPending ? "Saving..." : "Save Case"}
        </Button>
      </div>
      </form>
    </section>
  );
}

function DateField({
  error,
  helperText,
  label,
  name,
  setValue,
  value,
}: {
  error?: string | undefined;
  helperText?: string | undefined;
  label: string;
  name: DateMilestoneKey;
  setValue: Dispatch<SetStateAction<MilestoneFormState>>;
  value: string;
}) {
  return (
    <FormField error={error ?? ""} helperText={helperText} label={label}>
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
    priorityCase: boolean;
    tenderName: string;
    tenderNo: string;
    tmRemarks: string;
  },
) {
  if (!kase) return [];
  const fields: string[] = [];
  if (value.tenderName !== (kase.tenderName ?? "")) fields.push("Tender Name");
  if (value.tenderNo !== (kase.tenderNo ?? "")) fields.push("Tender No");
  if (value.tmRemarks !== (kase.tmRemarks ?? ""))
    fields.push("Tender Owner's Remarks");
  if (value.priorityCase !== kase.priorityCase) fields.push("Priority Case");
  return fields;
}

function buildFinancialChangedFields(
  kase: CaseDetail | undefined,
  value: {
    approvedAmount: string;
    estimateBenchmark: string;
  },
) {
  if (!kase) return [];
  const fields: string[] = [];
  if (
    value.approvedAmount.trim() &&
    isMoneyInput(value.approvedAmount) &&
    parseMoneyInput(value.approvedAmount) !==
      (kase.financials.approvedAmount ?? null)
  ) {
    fields.push("NFA Approved Amount (Rs.) [All Inclusive]");
  }
  if (
    value.estimateBenchmark.trim() &&
    isMoneyInput(value.estimateBenchmark) &&
    parseMoneyInput(value.estimateBenchmark) !==
      (kase.financials.estimateBenchmark ?? null)
  ) {
    fields.push("Estimate / Benchmark (Rs.) [All Inclusive]");
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
  tenderName: string;
  tenderNo: string;
  tmRemarks: string;
}): CaseFormErrors {
  const errors: CaseFormErrors = {};
  if (input.tenderName.length > 500) {
    errors.tenderName = "Tender name cannot exceed 500 characters.";
  }
  if (input.tenderNo.length > 200) {
    errors.tenderNo = "Tender number cannot exceed 200 characters.";
  }
  if (input.tmRemarks.length > 5000) {
    errors.tmRemarks = "Tender Owner's Remarks cannot exceed 5000 characters.";
  }
  return errors;
}

function validateFinancialForm(input: {
  approvedAmount: string;
  estimateBenchmark: string;
  milestones: MilestoneFormState;
}): FinancialFormErrors {
  const errors: FinancialFormErrors = {};
  if (
    input.estimateBenchmark.trim() &&
    !isMoneyInput(input.estimateBenchmark)
  ) {
    errors.estimateBenchmark =
      "Estimate / benchmark must be a valid amount greater than or equal to 0.";
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

function financialPayload(input: {
  approvedAmount: string;
  estimateBenchmark: string;
}) {
  if (!input.approvedAmount.trim() && !input.estimateBenchmark.trim()) {
    return null;
  }
  return {
    approvedAmount: input.approvedAmount.trim()
      ? parseMoneyInput(input.approvedAmount)
      : undefined,
    estimateBenchmark: input.estimateBenchmark.trim()
      ? parseMoneyInput(input.estimateBenchmark)
      : undefined,
  };
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

function validateMilestones(input: {
  estimateBenchmark: string;
  milestones: MilestoneFormState;
  prReceiptDate?: string | null;
}): MilestoneErrors {
  const errors: MilestoneErrors = {};
  const value = input.milestones;
  for (const key of dateMilestoneKeys) {
    if (value[key] && !isDateOnlyString(value[key])) {
      errors[key] = "Use a valid date.";
    }
  }

  if (
    input.prReceiptDate &&
    isDateOnlyString(input.prReceiptDate) &&
    isDateOnlyString(value.nitInitiationDate) &&
    value.nitInitiationDate < input.prReceiptDate
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
  requireMilestonePrerequisites(
    errors,
    value,
    Boolean(value.nfaSubmissionDate),
    "nfaSubmissionDate",
    [
      ["nitInitiationDate", "NIT Initiation"],
      ["nitApprovalDate", "NIT Approval"],
      ["nitPublishDate", "NIT Publish"],
      ["bidReceiptDate", "Bid Receipt"],
      ["biddersParticipated", "Bidders Participated"],
      ["commercialEvaluationDate", "Commercial Evaluation"],
      ["technicalEvaluationDate", "Technical Evaluation"],
      ["qualifiedBidders", "Qualified Bidders"],
    ],
    [[input.estimateBenchmark, "Estimate / Benchmark (Rs.) [All Inclusive]"]],
    "NFA Submission can be saved only after all prior milestone fields are filled.",
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

function requireMilestonePrerequisites(
  errors: MilestoneErrors,
  value: MilestoneFormState,
  shouldValidate: boolean,
  targetKey: keyof MilestoneFormState,
  prerequisites: Array<[keyof MilestoneFormState, string]>,
  externalPrerequisites: Array<[string, string]>,
  summaryMessage: string,
) {
  if (!shouldValidate || errors[targetKey]) return;
  const missingLabels = [
    ...prerequisites
      .filter(([key]) => {
        const fieldValue = value[key];
        return typeof fieldValue === "boolean" ? !fieldValue : !fieldValue;
      })
      .map(([, label]) => label),
    ...externalPrerequisites
      .filter(([fieldValue]) => !fieldValue.trim())
      .map(([, label]) => label),
  ];
  if (!missingLabels.length) return;
  errors[targetKey] = `${summaryMessage} Missing: ${missingLabels.join(", ")}.`;
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
