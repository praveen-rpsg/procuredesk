import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  getCatalogSnapshot,
  listAdminDepartments,
  listAssignableOwners,
} from "../../admin/api/adminApi";
import { listEntities } from "../../planning/api/planningApi";
import { createCase } from "../api/casesApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { addDaysToDateOnly, isDateOnlyString } from "../../../shared/utils/dateOnly";
import { Button } from "../../../shared/ui/button/Button";
import { ComboboxSelect } from "../../../shared/ui/form/ComboboxSelect";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type CreateCaseFormProps = {
  onCreated: (caseId: string) => void;
};

type CreateCaseFormValues = {
  budgetTypeId: string;
  cpcInvolved: boolean;
  departmentId: string;
  entityId: string;
  natureOfWorkId: string;
  ownerUserId: string;
  prDescription: string;
  prId: string;
  prReceiptDate: string;
  prValue: string;
  priorityCase: boolean;
  tenderTypeId: string;
  tentativeCompletionDate: string;
};

type CreateCaseFormErrors = Partial<Record<keyof CreateCaseFormValues, string>>;

type ParsedCreateCaseForm = {
  errors: CreateCaseFormErrors;
  prValue: number | null;
};

const categoryOptions = {
  budgetType: "budget_type",
  natureOfWork: "nature_of_work",
};

const createCaseFormSchema = {
  maxMoneyValue: 9999999999999999.99,
  maxPrIdLength: 100,
  maxTextLength: 5000,
};

export function CreateCaseForm({ onCreated }: CreateCaseFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [entityId, setEntityId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [tenderTypeId, setTenderTypeId] = useState("");
  const [budgetTypeId, setBudgetTypeId] = useState("");
  const [natureOfWorkId, setNatureOfWorkId] = useState("");
  const [cpcInvolved, setCpcInvolved] = useState(false);
  const [priorityCase, setPriorityCase] = useState(false);
  const [prId, setPrId] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [prReceiptDate, setPrReceiptDate] = useState("");
  const [tentativeCompletionDate, setTentativeCompletionDate] = useState("");
  const [prValue, setPrValue] = useState("");
  const [formErrors, setFormErrors] = useState<CreateCaseFormErrors>({});

  const entities = useQuery({ queryFn: listEntities, queryKey: ["entities"] });
  const catalog = useQuery({
    queryFn: getCatalogSnapshot,
    queryKey: ["catalog-snapshot"],
  });
  const departments = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAdminDepartments(entityId),
    queryKey: ["departments", entityId],
  });
  const owners = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAssignableOwners(entityId),
    queryKey: ["assignable-owners", entityId],
  });

  const selectedTenderType = useMemo(
    () =>
      catalog.data?.tenderTypes.find(
        (tenderType) => tenderType.id === tenderTypeId,
      ) ?? null,
    [catalog.data?.tenderTypes, tenderTypeId],
  );

  const referenceValues = catalog.data?.referenceValues ?? [];
  const budgetTypes = referenceValues.filter(
    (value) =>
      value.categoryCode === categoryOptions.budgetType && value.isActive,
  );
  const natureOfWork = referenceValues.filter(
    (value) =>
      value.categoryCode === categoryOptions.natureOfWork && value.isActive,
  );
  const activeTenderTypes = (catalog.data?.tenderTypes ?? []).filter(
    (tenderType) => tenderType.isActive,
  );
  const selectedEntity = useMemo(
    () => (entities.data ?? []).find((entity) => entity.id === entityId) ?? null,
    [entities.data, entityId],
  );
  const singleMappedEntityId = user?.entityIds.length === 1 ? user.entityIds[0] : "";
  const isSingleEntityMapped = Boolean(singleMappedEntityId);
  const entityOptions = useMemo(() => {
    const activeEntities = (entities.data ?? []).filter((entity) => entity.isActive);
    if (!user || user.isPlatformSuperAdmin || user.accessLevel === "GROUP") {
      return activeEntities;
    }
    const mappedEntityIds = new Set(user.entityIds);
    return activeEntities.filter((entity) => mappedEntityIds.has(entity.id));
  }, [entities.data, user]);

  useEffect(() => {
    setPrId(selectedEntity?.code ? buildGeneratedCaseId(selectedEntity.code) : "");
  }, [selectedEntity?.code]);

  useEffect(() => {
    if (!singleMappedEntityId || entityId === singleMappedEntityId) return;
    setEntityId(singleMappedEntityId);
    setDepartmentId("");
    setOwnerUserId("");
  }, [entityId, singleMappedEntityId]);

  useEffect(() => {
    if (!entityId || owners.isLoading || !owners.data) return;
    const ownerIds = new Set(owners.data.map((owner) => owner.id));
    if (ownerUserId && !ownerIds.has(ownerUserId)) {
      setOwnerUserId("");
      return;
    }
    if (!ownerUserId && user?.id && ownerIds.has(user.id)) {
      setOwnerUserId(user.id);
    }
  }, [entityId, ownerUserId, owners.data, owners.isLoading, user?.id]);

  useEffect(() => {
    if (
      !prReceiptDate ||
      selectedTenderType?.completionDays === null ||
      selectedTenderType?.completionDays === undefined
    ) {
      return;
    }
    setTentativeCompletionDate(
      addDaysToDateOnly(prReceiptDate, selectedTenderType.completionDays),
    );
  }, [prReceiptDate, selectedTenderType?.completionDays]);

  const mutation = useMutation({
    mutationFn: createCase,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-recent-cases"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-assigned-cases"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-priority-cases"],
      });
      toast.notify({ message: "Case created.", tone: "success" });
      onCreated(result.id);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = validateCreateCaseForm({
      budgetTypeId,
      cpcInvolved,
      departmentId,
      entityId,
      natureOfWorkId,
      ownerUserId,
      prDescription,
      prId,
      prReceiptDate,
      prValue,
      priorityCase,
      tenderTypeId,
      tentativeCompletionDate,
    });
    setFormErrors(parsed.errors);
    if (Object.keys(parsed.errors).length > 0) return;
    if (parsed.prValue == null) return;

    mutation.mutate({
      budgetTypeId,
      cpcInvolved,
      departmentId,
      entityId,
      financials: { prValue: parsed.prValue },
      natureOfWorkId,
      ownerUserId,
      prDescription,
      prId,
      prReceiptDate,
      priorityCase,
      tenderTypeId,
      tentativeCompletionDate,
    });
  }

  if (entities.isLoading || catalog.isLoading) {
    return (
      <div className="stack-form">
        <Skeleton height={18} />
        <Skeleton height={18} />
        <Skeleton height={18} />
      </div>
    );
  }

  return (
    <form className="stack-form create-case-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <p className="eyebrow">Entity</p>
        <div className="two-column">
          <FormField error={formErrors.entityId ?? ""} label="Entity">
            <select
              className="text-input"
              disabled={isSingleEntityMapped}
              onChange={(event) => {
                setEntityId(event.target.value);
                setDepartmentId("");
                setOwnerUserId("");
              }}
              required
              value={entityId}
            >
              <option value="">Select Entity</option>
              {entityOptions.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.code} - {entity.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField error={formErrors.departmentId ?? ""} label="Department">
            <select
              className="text-input"
              disabled={!entityId || departments.isLoading}
              onChange={(event) => setDepartmentId(event.target.value)}
              required
              value={departmentId}
            >
              <option value="">Select Department</option>
              {(departments.data ?? [])
                .filter((department) => department.isActive)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField error={formErrors.ownerUserId ?? ""} label="Tender Owner">
            <select
              className="text-input"
              disabled={!entityId || owners.isLoading}
              onChange={(event) => setOwnerUserId(event.target.value)}
              required
              value={ownerUserId}
            >
              <option value="">Select Tender Owner</option>
              {(owners.data ?? []).map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.fullName} - {owner.email}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <p className="eyebrow">PR</p>
        <div className="two-column">
          <FormField
            error={formErrors.prId ?? ""}
            helperText="Auto-generated as RPSG_EntityCode_DDMMYYYY_HHMMSS."
            label="Case ID"
          >
            <TextInput
              maxLength={100}
              placeholder="Select entity to generate"
              readOnly
              required
              value={prId}
            />
          </FormField>
          <FormField
            error={formErrors.prReceiptDate ?? ""}
            label="PR Receipt Date"
          >
            <TextInput
              onChange={(event) => setPrReceiptDate(event.target.value)}
              required
              type="date"
              value={prReceiptDate}
            />
          </FormField>
          <FormField
            error={formErrors.prValue ?? ""}
            helperText="INR amount, commas added automatically."
            label="PR Value / Approved Budget (Rs.) [All Inclusive]"
          >
            <TextInput
              inputMode="decimal"
              onChange={(event) =>
                setPrValue(formatCurrencyInput(event.target.value))
              }
              placeholder="0.00"
              required
              value={prValue}
            />
          </FormField>
        </div>
        <FormField
          error={formErrors.prDescription ?? ""}
          label="PR Description"
        >
          <TextArea
            maxLength={5000}
            onChange={(event) => setPrDescription(event.target.value)}
            required
            value={prDescription}
          />
        </FormField>
      </div>

      <div className="form-section">
        <p className="eyebrow">Classification</p>
        <div className="two-column">
          <FormField
            error={formErrors.tenderTypeId ?? ""}
            helperText={
              activeTenderTypes.length === 0
                ? "No active tender types configured. Add them in Admin > Tender Types."
                : "Used to default the tentative completion date."
            }
            label="Tender Type"
          >
            <ComboboxSelect
              disabled={activeTenderTypes.length === 0}
              emptyMessage="No active tender types configured."
              onChange={setTenderTypeId}
              options={activeTenderTypes.map((tenderType) => ({
                description:
                  tenderType.completionDays === null
                    ? "No default completion rule"
                    : `PR date + ${tenderType.completionDays} days`,
                label: tenderType.name,
                value: tenderType.id,
              }))}
              placeholder={
                activeTenderTypes.length === 0
                  ? "No active tender types"
                  : "Pick a Tender Type"
              }
              searchPlaceholder="Search tender type..."
              value={tenderTypeId}
            />
          </FormField>
          <FormField
            error={formErrors.tentativeCompletionDate ?? ""}
            helperText="Defaults from PR receipt date plus the selected tender type days."
            label="Tentative Completion Date"
          >
            <TextInput
              onChange={(event) =>
                setTentativeCompletionDate(event.target.value)
              }
              required
              type="date"
              value={tentativeCompletionDate}
            />
          </FormField>
          <FormField error={formErrors.budgetTypeId ?? ""} label="Budget Type">
            <select
              className="text-input"
              onChange={(event) => setBudgetTypeId(event.target.value)}
              required
              value={budgetTypeId}
            >
              <option value="">Select Budget Type</option>
              {budgetTypes.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField error={formErrors.natureOfWorkId ?? ""} label="Nature Of Work">
            <select
              className="text-input"
              onChange={(event) => setNatureOfWorkId(event.target.value)}
              required
              value={natureOfWorkId}
            >
              <option value="">Select Nature</option>
              {natureOfWork.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
          </FormField>
          <label className="checkbox-row">
            <input
              checked={cpcInvolved}
              onChange={(event) => setCpcInvolved(event.target.checked)}
              type="checkbox"
            />
            CPC Involved?
          </label>
          <label className="checkbox-row">
            <input
              checked={priorityCase}
              onChange={(event) => setPriorityCase(event.target.checked)}
              type="checkbox"
            />
            Priority Case
          </label>
        </div>
      </div>

      {mutation.error ? (
        <div className="form-error">{mutation.error.message}</div>
      ) : null}
      <div className="sticky-form-footer">
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Creating..." : "Create Case"}
        </Button>
      </div>
    </form>
  );
}

function validateCreateCaseForm(
  values: CreateCaseFormValues,
): ParsedCreateCaseForm {
  const errors: CreateCaseFormErrors = {};
  const prValue = parseCurrencyAmount(values.prValue);

  if (!values.entityId) {
    errors.entityId = "Entity is required.";
  }
  if (!values.departmentId) {
    errors.departmentId = "Department is required.";
  }
  if (!values.ownerUserId) {
    errors.ownerUserId = "Tender Owner is required.";
  }
  if (!values.prId.trim()) {
    errors.prId = "Case ID is required.";
  } else if (values.prId.trim().length > createCaseFormSchema.maxPrIdLength) {
    errors.prId = `Case ID must be ${createCaseFormSchema.maxPrIdLength} characters or less.`;
  }
  if (!values.prReceiptDate) {
    errors.prReceiptDate = "PR receipt date is required.";
  } else if (!isDateOnlyString(values.prReceiptDate)) {
    errors.prReceiptDate = "Use a valid PR receipt date.";
  }
  if (!values.tentativeCompletionDate) {
    errors.tentativeCompletionDate = "Tentative completion date is required.";
  } else if (!isDateOnlyString(values.tentativeCompletionDate)) {
    errors.tentativeCompletionDate = "Use a valid completion date.";
  }
  if (
    values.prReceiptDate &&
    values.tentativeCompletionDate &&
    values.tentativeCompletionDate < values.prReceiptDate
  ) {
    errors.tentativeCompletionDate =
      "Completion date cannot be before PR receipt date.";
  }
  if (!values.prDescription.trim()) {
    errors.prDescription = "PR description is required.";
  } else if (values.prDescription.length > createCaseFormSchema.maxTextLength) {
    errors.prDescription = `Description must be ${createCaseFormSchema.maxTextLength} characters or less.`;
  }
  if (!values.prValue.trim()) {
    errors.prValue = "PR value is required.";
  } else if (prValue == null) {
    errors.prValue = "Enter a valid non-negative INR amount.";
  } else if (prValue != null && prValue > createCaseFormSchema.maxMoneyValue) {
    errors.prValue = "PR value is too large.";
  }
  if (!values.tenderTypeId) {
    errors.tenderTypeId = "Tender Type is required.";
  }
  if (!values.budgetTypeId) {
    errors.budgetTypeId = "Budget Type is required.";
  }
  if (!values.natureOfWorkId) {
    errors.natureOfWorkId = "Nature Of Work is required.";
  }
  return { errors, prValue };
}

function parseCurrencyAmount(value: string): number | null {
  const normalizedValue = value.replace(/,/g, "").trim();
  if (!normalizedValue) return null;
  const parsed = Number(normalizedValue);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function formatCurrencyInput(value: string) {
  const normalizedValue = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const [rawInteger = "", ...decimalParts] = normalizedValue.split(".");
  const integerPart = rawInteger.replace(/^0+(?=\d)/, "");
  const decimalPart = decimalParts.join("").slice(0, 2);
  const formattedInteger = integerPart
    ? Number(integerPart).toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : "";
  if (normalizedValue.includes(".")) {
    return `${formattedInteger || "0"}.${decimalPart}`;
  }
  return formattedInteger;
}

function buildGeneratedCaseId(entityCode: string, date = new Date()): string {
  const normalizedEntityCode = entityCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `RPSG_${normalizedEntityCode || "ENTITY"}_${day}${month}${year}_${hours}${minutes}${seconds}`;
}
