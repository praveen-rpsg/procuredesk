import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  PanelRightOpen,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  X as XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  getCatalogSnapshot,
  listAdminDepartments,
  listAdminEntities,
  listAssignableOwners,
} from "../../admin/api/adminApi";
import { CaseDetailPanel } from "../components/CaseDetailPanel";
import { CreateCaseForm } from "../components/CreateCaseForm";
import { UpdateCasePanel } from "../components/UpdateCasePanel";
import {
  listCases,
  listDeletedCases,
  restoreCase,
  type CaseListItem,
  type DeletedCaseListItem,
} from "../api/casesApi";
import { CaseDetailPage } from "./CaseDetailPage";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canCreateCase, canRestoreCase } from "../../../shared/auth/permissions";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import { Button } from "../../../shared/ui/button/Button";
import { Drawer } from "../../../shared/ui/drawer/Drawer";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Checkbox } from "../../../shared/ui/form/Checkbox";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Select } from "../../../shared/ui/form/Select";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { type VirtualTableColumn, VirtualTable } from "../../../shared/ui/table/VirtualTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type BooleanFilter = "" | "false" | "true";
type CaseColumnKey =
  | "actions"
  | "approvedAmount"
  | "completionFy"
  | "cycleTime"
  | "department"
  | "description"
  | "entity"
  | "normativeStage"
  | "owner"
  | "percentTimeElapsed"
  | "prId"
  | "prValue"
  | "runAge"
  | "savingsWrtEstimate"
  | "savingsWrtPr"
  | "stage"
  | "status"
  | "tenderType"
  | "updated";
type ValueSlabFilter = "" | "100l_200l" | "10l_25l" | "25l_50l" | "2l_5l" | "50l_100l" | "5l_10l" | "gte_200l" | "lt_2l";
type StatusFilter = "completed" | "running";
type ValueSlabOption = Exclude<ValueSlabFilter, "">;
type CasesSectionKey = "active" | "recovery";

const casesSections = [
  { description: "Search, filter, export, and update procurement cases.", icon: Table2, key: "active", label: "Cases" },
  { description: "Restore recently deleted cases.", icon: ArchiveRestore, key: "recovery", label: "Recovery" },
] satisfies Array<{
  description: string;
  icon: typeof Table2;
  key: CasesSectionKey;
  label: string;
}>;

const casesSectionPaths: Record<CasesSectionKey, string> = {
  active: "/cases",
  recovery: "/cases/recovery",
};

type CaseViewState = {
  budgetTypeIds: string[];
  completionFys: string[];
  cpcInvolved: BooleanFilter;
  dateFrom: string;
  dateTo: string;
  departmentIds: string[];
  entityIds: string[];
  isDelayed: BooleanFilter;
  loiAwarded: BooleanFilter;
  natureOfWorkIds: string[];
  ownerUserId: string;
  priorityCase: BooleanFilter;
  prReceiptMonths: string[];
  q: string;
  statusValues: StatusFilter[];
  tenderTypeIds: string[];
  valueSlabs: ValueSlabOption[];
  visibleColumnKeys: CaseColumnKey[];
};

type SavedCaseView = {
  id: string;
  name: string;
  state: CaseViewState;
};

const valueSlabOptions = [
  { label: "All", value: "" },
  { label: "Below Rs. 2 Lakhs", value: "lt_2l" },
  { label: "Rs. 2 Lakhs - < Rs. 5 Lakhs", value: "2l_5l" },
  { label: "Rs. 5 Lakhs - < Rs. 10 Lakhs", value: "5l_10l" },
  { label: "Rs. 10 Lakhs - < Rs. 25 Lakhs", value: "10l_25l" },
  { label: "Rs. 25 Lakhs - < Rs. 50 Lakhs", value: "25l_50l" },
  { label: "Rs. 50 Lakhs - < Rs. 100 Lakhs", value: "50l_100l" },
  { label: "Rs. 100 Lakhs - < Rs. 200 Lakhs", value: "100l_200l" },
  { label: ">= Rs. 200 Lakhs", value: "gte_200l" },
];

const defaultVisibleColumnKeys: CaseColumnKey[] = [
  "prId",
  "description",
  "entity",
  "tenderType",
  "department",
  "owner",
  "prValue",
  "approvedAmount",
  "savingsWrtPr",
  "savingsWrtEstimate",
  "stage",
  "normativeStage",
  "percentTimeElapsed",
  "runAge",
  "cycleTime",
  "status",
  "completionFy",
  "updated",
  "actions",
];

const savedViewsStorageKey = "procuredesk.caseViews.v1";

export function CasesWorkspace() {
  const location = useAppLocation();
  const caseIdFromPath = parseCaseIdFromPath(location.pathname);

  if (caseIdFromPath) {
    return (
      <CaseDetailPage
        caseId={caseIdFromPath}
        onBack={() => navigateToAppPath("/cases")}
      />
    );
  }

  return <CasesWorkspaceList />;
}

function CasesWorkspaceList() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const location = useAppLocation();
  const activeSection = casesSectionFromPath(location.pathname) ?? "active";
  const [budgetTypeIds, setBudgetTypeIds] = useState<string[]>([]);
  const [completionFys, setCompletionFys] = useState<string[]>([]);
  const [cpcInvolved, setCpcInvolved] = useState<BooleanFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isDelayed, setIsDelayed] = useState<BooleanFilter>("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [loiAwarded, setLoiAwarded] = useState<BooleanFilter>("");
  const [natureOfWorkIds, setNatureOfWorkIds] = useState<string[]>([]);
  const [pageCursors, setPageCursors] = useState<string[]>([""]);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [priorityCase, setPriorityCase] = useState<BooleanFilter>("");
  const [prReceiptMonths, setPrReceiptMonths] = useState<string[]>([]);
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null);
  const [editCaseId, setEditCaseId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViews, setSavedViews] = useState<SavedCaseView[]>(readSavedCaseViews);
  const [statusValues, setStatusValues] = useState<StatusFilter[]>([]);
  const [tenderTypeIds, setTenderTypeIds] = useState<string[]>([]);
  const [valueSlabs, setValueSlabs] = useState<ValueSlabOption[]>([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<CaseColumnKey[]>(defaultVisibleColumnKeys);
  const debouncedQ = useDebouncedValue(q, 350);
  const currentCursor = pageCursors[pageCursors.length - 1] || undefined;
  const currentPageIndex = pageCursors.length - 1;
  const canCreate = canCreateCase(user);
  const canRestore = canRestoreCase(user);
  const selectedStatus = statusValues.length === 1 ? statusValues[0] : "";

  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["case-filter-entities"] });
  const catalog = useQuery({ queryFn: getCatalogSnapshot, queryKey: ["case-filter-catalog"] });
  const departments = useQuery({
    enabled: entityIds.length === 1,
    queryFn: () => listAdminDepartments(entityIds[0] ?? ""),
    queryKey: ["case-filter-departments", entityIds[0] ?? ""],
  });
  const assignableOwners = useQuery({
    enabled: entityIds.length === 1,
    queryFn: () => listAssignableOwners(entityIds[0] ?? ""),
    queryKey: ["case-filter-owners", entityIds[0] ?? ""],
  });

  const caseFilters = useMemo(
    () => ({
      budgetTypeIds: budgetTypeIds.length ? budgetTypeIds : undefined,
      completionFys: completionFys.length ? completionFys : undefined,
      cpcInvolved: booleanFilter(cpcInvolved),
      cursor: currentCursor,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      departmentIds: departmentIds.length ? departmentIds : undefined,
      entityIds: entityIds.length ? entityIds : undefined,
      isDelayed: booleanFilter(isDelayed),
      limit: 25,
      loiAwarded: booleanFilter(loiAwarded),
      natureOfWorkIds: natureOfWorkIds.length ? natureOfWorkIds : undefined,
      ownerUserId: ownerUserId || undefined,
      priorityCase: booleanFilter(priorityCase),
      prReceiptMonths: prReceiptMonths.length ? prReceiptMonths : undefined,
      q: debouncedQ || undefined,
      status: selectedStatus || undefined,
      tenderTypeIds: tenderTypeIds.length ? tenderTypeIds : undefined,
      valueSlabs: valueSlabs.length ? valueSlabs : undefined,
    }),
    [
      budgetTypeIds,
      completionFys,
      cpcInvolved,
      currentCursor,
      dateFrom,
      dateTo,
      debouncedQ,
      departmentIds,
      entityIds,
      isDelayed,
      loiAwarded,
      natureOfWorkIds,
      ownerUserId,
      priorityCase,
      prReceiptMonths,
      selectedStatus,
      tenderTypeIds,
      valueSlabs,
    ],
  );

  useEffect(() => {
    setPageCursors([""]);
  }, [
    budgetTypeIds,
    completionFys,
    cpcInvolved,
    dateFrom,
    dateTo,
    debouncedQ,
    departmentIds,
    entityIds,
    isDelayed,
    loiAwarded,
    natureOfWorkIds,
    ownerUserId,
    priorityCase,
    prReceiptMonths,
    selectedStatus,
    tenderTypeIds,
    valueSlabs,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "new" && canCreate) {
      setIsCreateOpen(true);
    }

    if (params.has("action")) {
      params.delete("action");
      const query = params.toString();
      navigateToAppPath(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
    }
  }, [canCreate, location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "assigned" && user?.id) {
      setOwnerUserId(user.id);
      setPageCursors([""]);
    }
  }, [location.search, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextStatus = toStatusFilter(params.get("status"));
    const nextIsDelayed = toBooleanFilter(params.get("isDelayed") ?? "");
    const nextPriorityCase = toBooleanFilter(params.get("priorityCase") ?? "");

    if (!params.has("status") && !params.has("isDelayed") && !params.has("priorityCase")) return;

    setStatusValues(nextStatus ? [nextStatus as StatusFilter] : []);
    setIsDelayed(nextIsDelayed);
    setPriorityCase(nextPriorityCase);
    setPageCursors([""]);
  }, [location.search]);

  const cases = useQuery({
    queryFn: () => listCases(caseFilters),
    queryKey: ["cases", caseFilters],
  });

  const deletedCases = useQuery({
    enabled: canRestore,
    queryFn: () => listDeletedCases({ limit: 10 }),
    queryKey: ["deleted-cases", 10],
  });
  const restoreMutation = useMutation({
    mutationFn: (caseId: string) => restoreCase(caseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["deleted-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-recent-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-assigned-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-delayed-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-priority-cases"] });
      notify({ message: "Case restored.", tone: "success" });
    },
  });
  const {
    error: restoreError,
    isPending: isRestorePending,
    mutate: restoreDeletedCase,
  } = restoreMutation;

  const entityNameById = useMemo(
    () => new Map((entities.data ?? []).map((entity) => [entity.id, entity.code])),
    [entities.data],
  );
  const budgetTypes = catalog.data?.referenceValues.filter((value) => value.categoryCode === "budget_type") ?? [];
  const natureOfWork = catalog.data?.referenceValues.filter((value) => value.categoryCode === "nature_of_work") ?? [];
  const ownerOptions = useMemo(() => {
    const options = (assignableOwners.data ?? []).map((owner) => ({
      label: owner.fullName,
      value: owner.id,
    }));
    if (ownerUserId && !options.some((option) => option.value === ownerUserId)) {
      options.unshift({
        label: ownerUserId === user?.id ? "Assigned To Me" : "Selected Owner",
        value: ownerUserId,
      });
    }
    return options;
  }, [assignableOwners.data, ownerUserId, user?.id]);
  const activeFilterCount = countActiveFilters([
    ...budgetTypeIds,
    ...completionFys,
    cpcInvolved,
    dateFrom,
    dateTo,
    ...departmentIds,
    ...entityIds,
    isDelayed,
    loiAwarded,
    ...natureOfWorkIds,
    ownerUserId,
    priorityCase,
    ...prReceiptMonths,
    ...statusValues,
    ...tenderTypeIds,
    ...valueSlabs,
  ]);

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (statusValues.length) chips.push({ key: "status", label: `Status: ${statusValues.join(", ")}`, onClear: () => setStatusValues([]) });
    if (entityIds.length) {
      chips.push({ key: "entity", label: `Entity: ${labelSelected(entityIds, entities.data?.map((e) => ({ label: e.code, value: e.id })) ?? [])}`, onClear: () => { setEntityIds([]); setDepartmentIds([]); setOwnerUserId(""); } });
    }
    if (departmentIds.length) {
      chips.push({ key: "dept", label: `Dept: ${labelSelected(departmentIds, departments.data?.map((d) => ({ label: d.name, value: d.id })) ?? [])}`, onClear: () => setDepartmentIds([]) });
    }
    if (ownerUserId) {
      const owner = ownerOptions.find((o) => o.value === ownerUserId);
      chips.push({ key: "owner", label: `Owner: ${owner?.label ?? ownerUserId}`, onClear: () => setOwnerUserId("") });
    }
    if (tenderTypeIds.length) {
      chips.push({ key: "tenderType", label: `Type: ${labelSelected(tenderTypeIds, catalog.data?.tenderTypes.map((t) => ({ label: t.name, value: t.id })) ?? [])}`, onClear: () => setTenderTypeIds([]) });
    }
    if (budgetTypeIds.length) {
      chips.push({ key: "budget", label: `Budget: ${labelSelected(budgetTypeIds, budgetTypes.map((b) => ({ label: b.label, value: b.id })))}`, onClear: () => setBudgetTypeIds([]) });
    }
    if (natureOfWorkIds.length) {
      chips.push({ key: "nature", label: `Nature: ${labelSelected(natureOfWorkIds, natureOfWork.map((n) => ({ label: n.label, value: n.id })))}`, onClear: () => setNatureOfWorkIds([]) });
    }
    if (priorityCase) chips.push({ key: "priority", label: priorityCase === "true" ? "Priority" : "Not Priority", onClear: () => setPriorityCase("") });
    if (isDelayed) chips.push({ key: "delayed", label: isDelayed === "true" ? "Delayed" : "On Track", onClear: () => setIsDelayed("") });
    if (cpcInvolved) chips.push({ key: "cpc", label: cpcInvolved === "true" ? "CPC: Yes" : "CPC: No", onClear: () => setCpcInvolved("") });
    if (loiAwarded) chips.push({ key: "loi", label: loiAwarded === "true" ? "LOI Awarded" : "LOI Not Awarded", onClear: () => setLoiAwarded("") });
    if (dateFrom) chips.push({ key: "dateFrom", label: `From: ${dateFrom}`, onClear: () => setDateFrom("") });
    if (dateTo) chips.push({ key: "dateTo", label: `To: ${dateTo}`, onClear: () => setDateTo("") });
    if (prReceiptMonths.length) chips.push({ key: "prMonths", label: `PR Month: ${prReceiptMonths.join(", ")}`, onClear: () => setPrReceiptMonths([]) });
    if (completionFys.length) chips.push({ key: "completionFy", label: `Comp. FY: ${completionFys.join(", ")}`, onClear: () => setCompletionFys([]) });
    if (valueSlabs.length) chips.push({ key: "valueSlab", label: `Value: ${labelSelected(valueSlabs, valueSlabOptions.filter((o) => o.value) as Array<{ label: string; value: string }> )}`, onClear: () => setValueSlabs([]) });
    return chips;
  }, [budgetTypeIds, budgetTypes, catalog.data, completionFys, cpcInvolved, dateFrom, dateTo, departmentIds, departments.data, entityIds, entities.data, isDelayed, loiAwarded, natureOfWork, natureOfWorkIds, ownerUserId, ownerOptions, prReceiptMonths, priorityCase, statusValues, tenderTypeIds, valueSlabs]);
  const caseRows = cases.data ?? [];
  const entityFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => entityNameById.get(row.entityId) ?? row.entityId),
    [caseRows, entityNameById],
  );
  const tenderTypeFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => row.tenderTypeName ?? "-"),
    [caseRows],
  );
  const departmentFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => row.departmentName ?? "-"),
    [caseRows],
  );
  const ownerFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => row.ownerFullName ?? "-"),
    [caseRows],
  );
  const stageFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => formatCaseStage(row.stageCode)),
    [caseRows],
  );
  const normativeStageFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => row.desiredStageCode == null ? "-" : formatCaseStage(row.desiredStageCode)),
    [caseRows],
  );
  const completionFyFilterOptions = useMemo(
    () => uniqueFilterOptions(caseRows, (row) => row.completionFy ?? "-"),
    [caseRows],
  );

  const allColumns = useMemo<Array<VirtualTableColumn<CaseListItem> & { key: CaseColumnKey }>>(
    () => [
      { key: "prId", header: "Case ID", render: (row) => row.prId },
      { key: "description", header: "Description", render: (row) => row.prDescription ?? row.tenderName ?? "-" },
      { key: "entity", filterOptions: entityFilterOptions, filterValue: (row) => entityNameById.get(row.entityId) ?? row.entityId, header: "Entity", render: (row) => entityNameById.get(row.entityId) ?? row.entityId },
      { key: "tenderType", filterOptions: tenderTypeFilterOptions, filterValue: (row) => row.tenderTypeName ?? "-", header: "Type", render: (row) => row.tenderTypeName ?? "-" },
      { key: "department", filterOptions: departmentFilterOptions, filterValue: (row) => row.departmentName ?? "-", header: "Dept", render: (row) => row.departmentName ?? "-" },
      { key: "owner", filterOptions: ownerFilterOptions, filterValue: (row) => row.ownerFullName ?? "-", header: "Tender Owner", render: (row) => row.ownerFullName ?? "-" },
      { key: "prValue", header: "PR Value / Approved Budget (Rs.) [All Inclusive]", render: (row) => formatMoney(row.prValue) },
      { key: "approvedAmount", header: "NFA Approved Amount (Rs.) [All Inclusive]", render: (row) => formatMoney(row.approvedAmount) },
      { key: "savingsWrtPr", header: "Savings vs PR / Approved Budget (Rs.) [All Inclusive]", render: (row) => formatMoney(row.savingsWrtPr) },
      { key: "savingsWrtEstimate", header: "Savings vs Estimate / Benchmark (Rs.) [All Inclusive]", render: (row) => formatMoney(row.savingsWrtEstimate) },
      { key: "stage", filterOptions: stageFilterOptions, filterValue: (row) => formatCaseStage(row.stageCode), header: "Tender Stage", render: (row) => formatCaseStage(row.stageCode) },
      { key: "normativeStage", filterOptions: normativeStageFilterOptions, filterValue: (row) => row.desiredStageCode == null ? "-" : formatCaseStage(row.desiredStageCode), header: "Normative Stage", render: (row) => row.desiredStageCode == null ? "-" : formatCaseStage(row.desiredStageCode) },
      { key: "percentTimeElapsed", header: "% Time Elapsed", render: (row) => row.status === "completed" ? "-" : formatPercent(row.percentTimeElapsed) },
      { key: "runAge", header: "Run Age", render: (row) => formatDays(row.runningAgeDays) },
      { key: "cycleTime", header: "Cycle Time", render: (row) => formatDays(row.cycleTimeDays) },
      {
        key: "status",
        filterOptions: [
          { label: "Running", value: "running" },
          { label: "Completed", value: "completed" },
        ],
        filterValue: (row) => row.status,
        header: "Status",
        render: (row) => <StatusBadge tone={row.status === "completed" ? "success" : "warning"}>{row.status}</StatusBadge>,
      },
      { key: "completionFy", filterOptions: completionFyFilterOptions, filterValue: (row) => row.completionFy ?? "-", header: "Comp. FY", render: (row) => row.completionFy ?? "-" },
      { key: "updated", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleDateString() },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <span className="row-actions case-grid-actions">
            <IconButton
              aria-label={`Preview ${row.prId}`}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewCaseId(row.id);
              }}
              tooltip="Preview case"
            >
              <PanelRightOpen size={15} />
            </IconButton>
          </span>
        ),
      },
    ],
    [completionFyFilterOptions, departmentFilterOptions, entityFilterOptions, entityNameById, normativeStageFilterOptions, ownerFilterOptions, stageFilterOptions, tenderTypeFilterOptions],
  );
  const columns = useMemo(
    () => allColumns.filter((column) => visibleColumnKeys.includes(column.key)),
    [allColumns, visibleColumnKeys],
  );
  const prReceiptMonthOptions = useMemo(() => buildRecentMonthOptions(), []);
  const completionFyOptions = useMemo(() => buildCompletionFyOptions(), []);
  const deletedCaseColumns = useMemo<Array<VirtualTableColumn<DeletedCaseListItem>>>(
    () => [
      { key: "prId", header: "Case ID", render: (row) => row.prId },
      { key: "entity", header: "Entity", render: (row) => entityNameById.get(row.entityId) ?? row.entityId },
      { key: "description", header: "Description", render: (row) => row.prDescription ?? row.tenderName ?? "-" },
      { key: "deletedAt", header: "Deleted", render: (row) => new Date(row.deletedAt).toLocaleString() },
      { key: "reason", header: "Reason", render: (row) => row.deleteReason ?? "-" },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <Button
            variant="secondary"
            size="sm"
            disabled={isRestorePending}
            onClick={() => restoreDeletedCase(row.id)}
          >
            <RotateCcw size={15} />
            Restore
          </Button>
        ),
      },
    ],
    [entityNameById, isRestorePending, restoreDeletedCase],
  );

  return (
    <section className="workspace-section">
      <PageHeader
        actions={
          canCreate ? <Button onClick={() => setIsCreateOpen(true)}>New Case</Button> : null
        }
        eyebrow="Procurement"
        title="Cases"
      >
        Create, track, and update procurement cases from PR intake to RC/PO award.
      </PageHeader>

      <section className="module-subnav-shell">
        <SecondaryNav
          activeKey={activeSection}
          ariaLabel="Case sections"
          items={canRestore ? casesSections : casesSections.filter((section) => section.key !== "recovery")}
          onChange={(key) => navigateToAppPath(casesSectionPaths[key])}
        />
      </section>

      {activeSection === "active" ? (
      <section className="module-content-area">
      <div className="workspace-toolbar">
        <div className="workspace-search">
          <span className="workspace-search-icon" aria-hidden="true">
            <Search size={15} />
          </span>
          <TextInput
            aria-label="Search cases"
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search Case ID, tender name…"
            value={q}
          />
        </div>
        <div className="case-toolbar-actions">
          <Button onClick={() => setIsFilterOpen((open) => !open)} variant="secondary">
            <SlidersHorizontal size={16} />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            {isFilterOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
          <Button variant="secondary" onClick={() => setIsColumnMenuOpen(true)}>
            Columns
          </Button>
        </div>
      </div>

      {filterChips.length > 0 ? (
        <div className="active-filters" role="group" aria-label="Active filters">
          {filterChips.map((chip) => (
            <span className="active-filter-chip" key={chip.key}>
              {chip.label}
              <button
                aria-label={`Remove ${chip.label} filter`}
                className="active-filter-chip-clear"
                onClick={chip.onClear}
                type="button"
              >
                <XIcon size={11} />
              </button>
            </span>
          ))}
          <button className="active-filters-clear-all" onClick={clearFilters} type="button">
            Clear all
          </button>
        </div>
      ) : null}

      {isFilterOpen ? (
        <section className="state-panel case-filter-panel" aria-label="Case filters">
          <div className="case-filter-panel-header">
            <div>
              <p className="eyebrow">Filters</p>
              <h2>Cases</h2>
            </div>
            <div className="case-filter-panel-actions">
              <Button variant="ghost" onClick={clearFilters}>Clear</Button>
              <Button onClick={() => setIsFilterOpen(false)}>Apply</Button>
            </div>
          </div>

          <div className="case-filter-grid">
            <MultiSelectFilter
              disabled={entities.isLoading}
              label="Entity"
              onChange={(values) => {
                setEntityIds(values);
                setDepartmentIds([]);
                setOwnerUserId("");
              }}
              options={(entities.data ?? []).map((entity) => ({ label: `${entity.code} - ${entity.name}`, value: entity.id }))}
              value={entityIds}
            />
            <MultiSelectFilter
              disabled={entityIds.length !== 1 || departments.isLoading}
              label="Department"
              onChange={setDepartmentIds}
              options={(departments.data ?? []).map((department) => ({ label: department.name, value: department.id }))}
              value={departmentIds}
            />
            <MultiSelectFilter
              disabled={catalog.isLoading}
              label="Tender Type"
              onChange={setTenderTypeIds}
              options={(catalog.data?.tenderTypes ?? []).map((tenderType) => ({ label: tenderType.name, value: tenderType.id }))}
              value={tenderTypeIds}
            />
            <MultiSelectFilter
              disabled={catalog.isLoading}
              label="Nature of Work"
              onChange={setNatureOfWorkIds}
              options={natureOfWork.map((value) => ({ label: value.label, value: value.id }))}
              value={natureOfWorkIds}
            />
            <MultiSelectFilter
              disabled={catalog.isLoading}
              label="Budget Type"
              onChange={setBudgetTypeIds}
              options={budgetTypes.map((value) => ({ label: value.label, value: value.id }))}
              value={budgetTypeIds}
            />
            <MultiSelectFilter
              label="PR Receipt Month"
              onChange={setPrReceiptMonths}
              options={prReceiptMonthOptions}
              value={prReceiptMonths}
            />
            <MultiSelectFilter
              label="Completion FY"
              onChange={setCompletionFys}
              options={completionFyOptions}
              value={completionFys}
            />
            <MultiSelectFilter
              label="Value Slab"
              onChange={(values) => setValueSlabs(values as ValueSlabOption[])}
              options={valueSlabOptions.filter((option) => option.value) as Array<{ label: string; value: string }>}
              value={valueSlabs}
            />
            <FormField label="Status">
              <div className="case-filter-checks">
                <Checkbox checked={statusValues.includes("running")} label="Running" onChange={(event) => setStatusValues(toggleArrayValue(statusValues, "running", event.target.checked))} />
                <Checkbox checked={statusValues.includes("completed")} label="Completed" onChange={(event) => setStatusValues(toggleArrayValue(statusValues, "completed", event.target.checked))} />
              </div>
            </FormField>
            <FormField label="Delay Status">
              <Select
                onChange={(event) => setIsDelayed(toBooleanFilter(event.target.value))}
                options={[{ label: "Delayed", value: "true" }, { label: "On Time", value: "false" }]}
                placeholder="All"
                value={isDelayed}
              />
            </FormField>
            <FormField label="Routed Through CPC">
              <Select
                onChange={(event) => setCpcInvolved(toBooleanFilter(event.target.value))}
                options={[{ label: "Yes", value: "true" }, { label: "No", value: "false" }]}
                placeholder="Any"
                value={cpcInvolved}
              />
            </FormField>
            <FormField label="LOI Awarded?">
              <Select
                onChange={(event) => setLoiAwarded(toBooleanFilter(event.target.value))}
                options={[{ label: "Yes", value: "true" }, { label: "No", value: "false" }]}
                placeholder="All"
                value={loiAwarded}
              />
            </FormField>
            <FormField label="Priority">
              <Checkbox checked={priorityCase === "true"} label="Priority cases only" onChange={(event) => setPriorityCase(event.target.checked ? "true" : "")} />
            </FormField>
            <FormField label="Assigned to me">
              <Checkbox checked={ownerUserId === user?.id} label="Assigned to me" onChange={(event) => setOwnerUserId(event.target.checked && user?.id ? user.id : "")} />
            </FormField>
            <FormField label="PR Date From">
              <TextInput onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
            </FormField>
            <FormField label="PR Date To">
              <TextInput onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
            </FormField>
          </div>

          <div className="case-saved-view-row">
            <FormField label="Saved View">
              <Select
                onChange={(event) => {
                  const view = savedViews.find((item) => item.id === event.target.value);
                  if (view) applySavedView(view);
                }}
                options={savedViews.map((view) => ({ label: view.name, value: view.id }))}
                placeholder="Select Saved View"
                value=""
              />
            </FormField>
            <div className="case-filter-save-view">
              <FormField label="View Name">
                <TextInput onChange={(event) => setSavedViewName(event.target.value)} value={savedViewName} />
              </FormField>
              <Button disabled={!savedViewName.trim()} onClick={saveCurrentView} size="sm">
                <Save size={14} />
                Save
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Drawer isOpen={isColumnMenuOpen} onClose={() => setIsColumnMenuOpen(false)} title="Columns">
        <div className="filter-drawer-content">
          {allColumns.map((column) => (
            <Checkbox
              checked={visibleColumnKeys.includes(column.key)}
              disabled={column.key === "prId" || column.key === "actions"}
              key={column.key}
              label={column.header}
              onChange={(event) => toggleColumn(column.key, event.target.checked)}
            />
          ))}
        </div>
      </Drawer>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Case">
        <CreateCaseForm
          onCreated={(caseId) => {
            setIsCreateOpen(false);
            navigateToAppPath(`/cases/${caseId}`);
          }}
        />
      </Modal>

      <Drawer isOpen={Boolean(editCaseId)} onClose={() => setEditCaseId(null)} title="Edit Case">
        <UpdateCasePanel caseId={editCaseId} />
      </Drawer>

      {cases.isLoading ? (
        <section className="state-panel" style={{ display: "grid", gap: "var(--space-2)" }}>
          <Skeleton height={16} />
          <Skeleton height={16} width="85%" />
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="90%" />
          <Skeleton height={16} width="60%" />
        </section>
      ) : cases.error ? (
        <ErrorState message={cases.error.message} />
      ) : (
        <>
          <VirtualTable
            columns={columns}
            emptyMessage="No cases match the current filters."
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigateToAppPath(`/cases/${row.id}`)}
            pagination={false}
            rows={cases.data ?? []}
          />
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {(cases.data ?? []).length} cases
            </span>
            <Button
              variant="secondary"
              disabled={currentPageIndex === 0}
              onClick={() => setPageCursors((cursors) => cursors.slice(0, -1))}
            >
              Previous
            </Button>
            <span className="pagination-page-pill">Page {currentPageIndex + 1}</span>
            <Button
              variant="secondary"
              disabled={(cases.data ?? []).length < 25}
              onClick={() => {
                const rows = cases.data ?? [];
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                  setPageCursors((cursors) => [...cursors, buildCaseCursor(lastRow)]);
                }
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}
      </section>
      ) : null}

      {activeSection === "recovery" && canRestore ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Admin Recovery</p>
              <h2>Recently Deleted Cases</h2>
            </div>
          </div>
          {deletedCases.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="10%" />
                  <Skeleton height={13} width="8%" />
                  <Skeleton height={13} width="36%" />
                  <Skeleton height={13} width="14%" />
                  <Skeleton height={13} width="18%" />
                </div>
              ))}
            </div>
          ) : deletedCases.error ? (
            <p className="inline-error">{deletedCases.error.message}</p>
          ) : (
            <VirtualTable
              columns={deletedCaseColumns}
              emptyMessage="No deleted cases available for restore."
              getRowKey={(row) => row.id}
              maxHeight={360}
              rows={deletedCases.data ?? []}
            />
          )}
          {restoreError ? <p className="inline-error">{restoreError.message}</p> : null}
        </section>
      ) : null}

      <Drawer isOpen={Boolean(previewCaseId)} onClose={() => setPreviewCaseId(null)} title="Case Preview">
        <CaseDetailPanel
          caseId={previewCaseId}
          onAward={() => {
            if (previewCaseId) navigateToAppPath(`/cases/${previewCaseId}?tab=awards`);
          }}
          onDeleted={() => setPreviewCaseId(null)}
          onEdit={() => {
            setEditCaseId(previewCaseId);
            setPreviewCaseId(null);
          }}
          onOpenFull={() => {
            if (previewCaseId) navigateToAppPath(`/cases/${previewCaseId}`);
          }}
        />
      </Drawer>
    </section>
  );

  function clearFilters() {
    setBudgetTypeIds([]);
    setCompletionFys([]);
    setCpcInvolved("");
    setDateFrom("");
    setDateTo("");
    setDepartmentIds([]);
    setEntityIds([]);
    setIsDelayed("");
    setLoiAwarded("");
    setNatureOfWorkIds([]);
    setOwnerUserId("");
    setPriorityCase("");
    setPrReceiptMonths([]);
    setQ("");
    setStatusValues([]);
    setTenderTypeIds([]);
    setValueSlabs([]);
  }

  function currentViewState(): CaseViewState {
    return {
      budgetTypeIds,
      completionFys,
      cpcInvolved,
      dateFrom,
      dateTo,
      departmentIds,
      entityIds,
      isDelayed,
      loiAwarded,
      natureOfWorkIds,
      ownerUserId,
      priorityCase,
      prReceiptMonths,
      q,
      statusValues,
      tenderTypeIds,
      valueSlabs,
      visibleColumnKeys,
    };
  }

  function saveCurrentView() {
    const nextViews = [
      ...savedViews.filter((view) => view.name.toLowerCase() !== savedViewName.trim().toLowerCase()),
      { id: crypto.randomUUID(), name: savedViewName.trim(), state: currentViewState() },
    ].sort((left, right) => left.name.localeCompare(right.name));
    setSavedViews(nextViews);
    writeSavedCaseViews(nextViews);
    setSavedViewName("");
  }

  function applySavedView(view: SavedCaseView) {
    setBudgetTypeIds(view.state.budgetTypeIds ?? []);
    setCompletionFys(view.state.completionFys ?? []);
    setCpcInvolved(view.state.cpcInvolved);
    setDateFrom(view.state.dateFrom);
    setDateTo(view.state.dateTo);
    setDepartmentIds(view.state.departmentIds ?? []);
    setEntityIds(view.state.entityIds ?? []);
    setIsDelayed(view.state.isDelayed);
    setLoiAwarded(view.state.loiAwarded ?? "");
    setNatureOfWorkIds(view.state.natureOfWorkIds ?? []);
    setOwnerUserId(view.state.ownerUserId);
    setPriorityCase(view.state.priorityCase);
    setPrReceiptMonths(view.state.prReceiptMonths ?? []);
    setQ(view.state.q);
    setStatusValues(view.state.statusValues ?? []);
    setTenderTypeIds(view.state.tenderTypeIds ?? []);
    setValueSlabs(view.state.valueSlabs ?? []);
    setVisibleColumnKeys(normalizeColumnKeys(view.state.visibleColumnKeys));
  }

  function toggleColumn(columnKey: CaseColumnKey, isVisible: boolean) {
    if (columnKey === "prId" || columnKey === "actions") return;
    setVisibleColumnKeys((current) =>
      isVisible ? [...current, columnKey] : current.filter((key) => key !== columnKey),
    );
  }
}

type FilterOption = {
  label: string;
  value: string;
};

function MultiSelectFilter({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string[]) => void;
  options: FilterOption[];
  value: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabel = selectedFilterLabel(value, options);
  const visibleOptions = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <FormField label={label}>
      <div className="multi-select-dropdown">
        <button
          aria-expanded={isOpen}
          className="multi-select-trigger"
          disabled={disabled}
          onBlur={(event) => {
            if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
            }
          }}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={16} />
        </button>
        {isOpen ? (
          <div
            className="multi-select-menu"
            onBlur={(event) => {
              if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                setIsOpen(false);
              }
            }}
          >
            <div className="multi-select-menu-actions">
              <button disabled={options.length === 0} onClick={() => onChange(options.map((option) => option.value))} type="button">
                Select all
              </button>
              <button disabled={value.length === 0} onClick={() => onChange([])} type="button">
                Clear
              </button>
              <span>{value.length ? `${value.length} selected` : "All"}</span>
            </div>
            {options.length > 6 ? (
              <TextInput
                autoFocus
                aria-label={`Search ${label}`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                value={query}
              />
            ) : null}
            <div className="multi-select-options">
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <Checkbox
                    checked={value.includes(option.value)}
                    key={option.value}
                    label={option.label}
                    onChange={(event) => onChange(toggleArrayValue(value, option.value, event.target.checked))}
                  />
                ))
              ) : (
                <span className="multi-select-empty">No options found.</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

function booleanFilter(value: BooleanFilter) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function toBooleanFilter(value: string): BooleanFilter {
  return value === "true" || value === "false" ? value : "";
}

function toStatusFilter(value: string | null): string {
  return value === "running" || value === "completed" ? value : "";
}

function countActiveFilters(values: string[]) {
  return values.filter(Boolean).length;
}

function toggleArrayValue<T extends string>(values: T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}

function labelSelected(values: string[], options: FilterOption[]): string {
  if (values.length === 0) return "All";
  if (values.length === options.length && options.length > 0) return "All";
  const labels = values.map((value) => options.find((option) => option.value === value)?.label ?? value);
  return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
}

function selectedFilterLabel(values: string[], options: FilterOption[]): string {
  if (!values.length) return "All";
  if (values.length === options.length && options.length > 0) return "All selected";
  const labels = values.map((selected) => options.find((option) => option.value === selected)?.label ?? selected);
  if (labels.length > 2) return `${labels.length} selected`;
  return labels.join(", ");
}

function uniqueFilterOptions<TRow>(rows: TRow[], getValue: (row: TRow) => string): FilterOption[] {
  return [...new Set(rows.map((row) => getValue(row)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ label: value, value: value.toLowerCase() }));
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatDays(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value)}%`;
}

function buildRecentMonthOptions(): FilterOption[] {
  const options: FilterOption[] = [];
  const current = new Date();
  for (let index = 0; index < 18; index += 1) {
    const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ label: value, value });
  }
  return options;
}

function buildCompletionFyOptions(): FilterOption[] {
  const year = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => {
    const start = year - 2 + index;
    const value = `${start}-${start + 1}`;
    return { label: value, value };
  });
}

function buildCaseCursor(row: CaseListItem) {
  return `${row.updatedAt}|${row.id}`;
}

function readSavedCaseViews(): SavedCaseView[] {
  try {
    const rawValue = window.localStorage.getItem(savedViewsStorageKey);
    if (!rawValue) return [];
    const parsed: unknown = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter(isSavedCaseView) : [];
  } catch {
    return [];
  }
}

function writeSavedCaseViews(views: SavedCaseView[]) {
  try {
    window.localStorage.setItem(savedViewsStorageKey, JSON.stringify(views));
  } catch {
    // Saving a local view should never block the primary case-list workflow.
  }
}

function isSavedCaseView(value: unknown): value is SavedCaseView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedCaseView>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && Boolean(candidate.state);
}

function normalizeColumnKeys(value: unknown): CaseColumnKey[] {
  const allowedKeys = new Set(defaultVisibleColumnKeys);
  if (!Array.isArray(value)) return defaultVisibleColumnKeys;
  const keys = value.filter((key): key is CaseColumnKey => typeof key === "string" && allowedKeys.has(key as CaseColumnKey));
  const requiredKeys = ["prId", "actions"] satisfies CaseColumnKey[];
  for (const key of requiredKeys) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.length ? keys : defaultVisibleColumnKeys;
}

function parseCaseIdFromPath(pathname: string): string | null {
  if (pathname === "/cases/recovery") return null;
  const match = /^\/cases\/([^/]+)$/.exec(pathname);
  return match ? (match[1] ?? null) : null;
}

function casesSectionFromPath(pathname: string): CasesSectionKey | null {
  const match = Object.entries(casesSectionPaths).find(([, path]) => pathname === path);
  return match?.[0] as CasesSectionKey | null;
}
