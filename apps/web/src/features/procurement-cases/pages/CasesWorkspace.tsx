import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  Download,
  ExternalLink,
  PanelRightOpen,
  Pencil,
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
import { canCreateCase, canPotentiallyUpdateCaseFromList, canRestoreCase } from "../../../shared/auth/permissions";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import { todayDateOnlyString, toDateOnlyInputValue } from "../../../shared/utils/dateOnly";
import { Button } from "../../../shared/ui/button/Button";
import { Drawer } from "../../../shared/ui/drawer/Drawer";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { FilterDrawer } from "../../../shared/ui/filter-drawer/FilterDrawer";
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
type CaseColumnKey = "actions" | "description" | "entity" | "flags" | "prId" | "select" | "stage" | "status" | "updated";
type ValueSlabFilter = "" | "10l_1cr" | "1cr_10cr" | "gte_10cr" | "lt_10l";
type CasesSectionKey = "active" | "recovery";

const casesSections = [
  { description: "Search, filter, export, and update live procurement cases.", icon: Table2, key: "active", label: "Active Cases" },
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
  budgetTypeId: string;
  cpcInvolved: BooleanFilter;
  dateFrom: string;
  dateTo: string;
  departmentId: string;
  entityId: string;
  isDelayed: BooleanFilter;
  natureOfWorkId: string;
  ownerUserId: string;
  priorityCase: BooleanFilter;
  q: string;
  status: string;
  tenderTypeId: string;
  valueSlab: ValueSlabFilter;
  visibleColumnKeys: CaseColumnKey[];
};

type SavedCaseView = {
  id: string;
  name: string;
  state: CaseViewState;
};

const valueSlabOptions = [
  { label: "Any Value", value: "" },
  { label: "< 10L", value: "lt_10l" },
  { label: "10L - 1Cr", value: "10l_1cr" },
  { label: "1Cr - 10Cr", value: "1cr_10cr" },
  { label: "10Cr+", value: "gte_10cr" },
];

const defaultVisibleColumnKeys: CaseColumnKey[] = [
  "select",
  "prId",
  "entity",
  "description",
  "status",
  "stage",
  "flags",
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
  const [budgetTypeId, setBudgetTypeId] = useState("");
  const [cpcInvolved, setCpcInvolved] = useState<BooleanFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isDelayed, setIsDelayed] = useState<BooleanFilter>("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [natureOfWorkId, setNatureOfWorkId] = useState("");
  const [pageCursors, setPageCursors] = useState<string[]>([""]);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [priorityCase, setPriorityCase] = useState<BooleanFilter>("");
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null);
  const [editCaseId, setEditCaseId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViews, setSavedViews] = useState<SavedCaseView[]>(readSavedCaseViews);
  const [status, setStatus] = useState("");
  const [tenderTypeId, setTenderTypeId] = useState("");
  const [valueSlab, setValueSlab] = useState<ValueSlabFilter>("");
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<CaseColumnKey[]>(defaultVisibleColumnKeys);
  const debouncedQ = useDebouncedValue(q, 350);
  const currentCursor = pageCursors[pageCursors.length - 1] || undefined;
  const currentPageIndex = pageCursors.length - 1;
  const canCreate = canCreateCase(user);
  const canRestore = canRestoreCase(user);

  const entities = useQuery({ queryFn: listAdminEntities, queryKey: ["case-filter-entities"] });
  const catalog = useQuery({ queryFn: getCatalogSnapshot, queryKey: ["case-filter-catalog"] });
  const departments = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAdminDepartments(entityId),
    queryKey: ["case-filter-departments", entityId],
  });
  const assignableOwners = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAssignableOwners(entityId),
    queryKey: ["case-filter-owners", entityId],
  });

  const caseFilters = useMemo(
    () => ({
      budgetTypeIds: budgetTypeId ? [budgetTypeId] : undefined,
      cpcInvolved: booleanFilter(cpcInvolved),
      cursor: currentCursor,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      departmentIds: departmentId ? [departmentId] : undefined,
      entityIds: entityId ? [entityId] : undefined,
      isDelayed: booleanFilter(isDelayed),
      limit: 25,
      natureOfWorkIds: natureOfWorkId ? [natureOfWorkId] : undefined,
      ownerUserId: ownerUserId || undefined,
      priorityCase: booleanFilter(priorityCase),
      q: debouncedQ || undefined,
      status: status || undefined,
      tenderTypeIds: tenderTypeId ? [tenderTypeId] : undefined,
      valueSlab: valueSlab || undefined,
    }),
    [
      budgetTypeId,
      cpcInvolved,
      currentCursor,
      dateFrom,
      dateTo,
      debouncedQ,
      departmentId,
      entityId,
      isDelayed,
      natureOfWorkId,
      ownerUserId,
      priorityCase,
      status,
      tenderTypeId,
      valueSlab,
    ],
  );

  useEffect(() => {
    setPageCursors([""]);
  }, [
    budgetTypeId,
    cpcInvolved,
    dateFrom,
    dateTo,
    debouncedQ,
    departmentId,
    entityId,
    isDelayed,
    natureOfWorkId,
    ownerUserId,
    priorityCase,
    status,
    tenderTypeId,
    valueSlab,
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

  const cases = useQuery({
    queryFn: () => listCases(caseFilters),
    queryKey: ["cases", caseFilters],
  });
  const selectedRows = useMemo(
    () => (cases.data ?? []).filter((row) => selectedCaseIds.includes(row.id)),
    [cases.data, selectedCaseIds],
  );

  useEffect(() => {
    const visibleCaseIds = new Set((cases.data ?? []).map((row) => row.id));
    setSelectedCaseIds((current) => current.filter((caseId) => visibleCaseIds.has(caseId)));
  }, [cases.data]);

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
    budgetTypeId,
    cpcInvolved,
    dateFrom,
    dateTo,
    departmentId,
    entityId,
    isDelayed,
    natureOfWorkId,
    ownerUserId,
    priorityCase,
    status,
    tenderTypeId,
    valueSlab,
  ]);

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (status) chips.push({ key: "status", label: `Status: ${status}`, onClear: () => setStatus("") });
    if (entityId) {
      const entity = entities.data?.find((e) => e.id === entityId);
      chips.push({ key: "entity", label: `Entity: ${entity?.code ?? entityId}`, onClear: () => { setEntityId(""); setDepartmentId(""); setOwnerUserId(""); } });
    }
    if (departmentId) {
      const dept = departments.data?.find((d) => d.id === departmentId);
      chips.push({ key: "dept", label: `Dept: ${dept?.name ?? departmentId}`, onClear: () => setDepartmentId("") });
    }
    if (ownerUserId) {
      const owner = ownerOptions.find((o) => o.value === ownerUserId);
      chips.push({ key: "owner", label: `Owner: ${owner?.label ?? ownerUserId}`, onClear: () => setOwnerUserId("") });
    }
    if (tenderTypeId) {
      const tt = catalog.data?.tenderTypes.find((t) => t.id === tenderTypeId);
      chips.push({ key: "tenderType", label: `Type: ${tt?.name ?? tenderTypeId}`, onClear: () => setTenderTypeId("") });
    }
    if (budgetTypeId) {
      const bt = budgetTypes.find((b) => b.id === budgetTypeId);
      chips.push({ key: "budget", label: `Budget: ${bt?.label ?? budgetTypeId}`, onClear: () => setBudgetTypeId("") });
    }
    if (natureOfWorkId) {
      const nw = natureOfWork.find((n) => n.id === natureOfWorkId);
      chips.push({ key: "nature", label: `Nature: ${nw?.label ?? natureOfWorkId}`, onClear: () => setNatureOfWorkId("") });
    }
    if (priorityCase) chips.push({ key: "priority", label: priorityCase === "true" ? "Priority" : "Not Priority", onClear: () => setPriorityCase("") });
    if (isDelayed) chips.push({ key: "delayed", label: isDelayed === "true" ? "Delayed" : "On Track", onClear: () => setIsDelayed("") });
    if (cpcInvolved) chips.push({ key: "cpc", label: cpcInvolved === "true" ? "CPC Involved" : "No CPC", onClear: () => setCpcInvolved("") });
    if (dateFrom) chips.push({ key: "dateFrom", label: `From: ${dateFrom}`, onClear: () => setDateFrom("") });
    if (dateTo) chips.push({ key: "dateTo", label: `To: ${dateTo}`, onClear: () => setDateTo("") });
    if (valueSlab) {
      const vsl = valueSlabOptions.find((o) => o.value === valueSlab);
      chips.push({ key: "valueSlab", label: `Value: ${vsl?.label ?? valueSlab}`, onClear: () => setValueSlab("") });
    }
    return chips;
  }, [status, entityId, entities.data, departmentId, departments.data, ownerUserId, ownerOptions, tenderTypeId, catalog.data, budgetTypeId, budgetTypes, natureOfWorkId, natureOfWork, priorityCase, isDelayed, cpcInvolved, dateFrom, dateTo, valueSlab]);

  const allColumns = useMemo<Array<VirtualTableColumn<CaseListItem> & { key: CaseColumnKey }>>(
    () => [
      {
        key: "select",
        header: "",
        render: (row) => (
          <input
            aria-label={`Select case ${row.prId}`}
            checked={selectedCaseIds.includes(row.id)}
            onChange={(event) => toggleCaseSelection(row.id, event.target.checked)}
            type="checkbox"
          />
        ),
      },
      { key: "prId", header: "Case ID", render: (row) => row.prId },
      { key: "entity", header: "Entity", render: (row) => entityNameById.get(row.entityId) ?? row.entityId },
      { key: "description", header: "Description", render: (row) => row.prDescription ?? row.tenderName ?? "-" },
      {
        key: "status",
        header: "Status",
        render: (row) => <StatusBadge tone={row.status === "completed" ? "success" : "warning"}>{row.status}</StatusBadge>,
      },
      { key: "stage", header: "Stage", render: (row) => formatCaseStage(row.stageCode) },
      {
        key: "flags",
        header: "Flags",
        render: (row) => (
          <span className="row-actions">
            {isCaseOverdue(row) ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
            {row.priorityCase ? <StatusBadge tone="warning">Priority</StatusBadge> : null}
            {row.isDelayed ? <StatusBadge tone="danger">Delayed</StatusBadge> : null}
            {row.cpcInvolved ? <StatusBadge>CPC</StatusBadge> : null}
            {!isCaseOverdue(row) && !row.priorityCase && !row.isDelayed && !row.cpcInvolved ? "-" : null}
          </span>
        ),
      },
      { key: "updated", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleDateString() },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <span className="row-actions case-grid-actions">
            <IconButton
              aria-label={`Preview ${row.prId}`}
              onClick={() => setPreviewCaseId(row.id)}
              tooltip="Preview"
            >
              <PanelRightOpen size={15} />
            </IconButton>
            {canPotentiallyUpdateCaseFromList(user, row) ? (
            <IconButton
              aria-label={`Edit ${row.prId}`}
              onClick={() => setEditCaseId(row.id)}
              tooltip="Edit"
            >
              <Pencil size={15} />
            </IconButton>
            ) : null}
            <IconButton
              aria-label={`Open ${row.prId}`}
              onClick={() => navigateToAppPath(`/cases/${row.id}`)}
              tooltip="Open"
            >
              <ExternalLink size={15} />
            </IconButton>
          </span>
        ),
      },
    ],
    [entityNameById, selectedCaseIds, user],
  );
  const columns = useMemo(
    () => allColumns.filter((column) => visibleColumnKeys.includes(column.key)),
    [allColumns, visibleColumnKeys],
  );
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
          <>
            <Button onClick={() => setIsFilterOpen(true)}>
              <SlidersHorizontal size={16} />
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            <Button variant="secondary" onClick={() => setIsColumnMenuOpen(true)}>
              Columns
            </Button>
            <Button variant="secondary" onClick={() => exportCurrentView(cases.data ?? [], columns)}>
              <Download size={16} />
              Export Page
            </Button>
            <Button
              disabled={selectedRows.length === 0}
              variant="secondary"
              onClick={() => exportCurrentView(selectedRows, columns)}
            >
              <Download size={16} />
              Export Selected{selectedRows.length ? ` (${selectedRows.length})` : ""}
            </Button>
            {canCreate ? <Button onClick={() => setIsCreateOpen(true)}>New Case</Button> : null}
          </>
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

      <FilterDrawer
        actions={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Clear All
            </Button>
            <Button onClick={() => setIsFilterOpen(false)}>Done</Button>
          </>
        }
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Case Filters"
      >
        <section className="filter-drawer-section">
          <h3>Saved Views</h3>
          <FormField label="Apply View">
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
          <div className="form-action-inline">
            <FormField label="View Name">
              <TextInput onChange={(event) => setSavedViewName(event.target.value)} value={savedViewName} />
            </FormField>
            <Button disabled={!savedViewName.trim()} onClick={saveCurrentView} size="sm">
              <Save size={14} />
              Save
            </Button>
          </div>
        </section>

        <section className="filter-drawer-section">
          <h3>Status &amp; Flags</h3>
          <FormField label="Status">
            <Select
              onChange={(event) => setStatus(event.target.value)}
              options={[
                { label: "Running", value: "running" },
                { label: "Completed", value: "completed" },
              ]}
              placeholder="Any Status"
              value={status}
            />
          </FormField>
          <FormField label="Priority">
            <Select
              onChange={(event) => setPriorityCase(toBooleanFilter(event.target.value))}
              options={[
                { label: "Priority Only", value: "true" },
                { label: "Normal Only", value: "false" },
              ]}
              placeholder="Any Priority"
              value={priorityCase}
            />
          </FormField>
          <FormField label="Delay Status">
            <Select
              onChange={(event) => setIsDelayed(toBooleanFilter(event.target.value))}
              options={[
                { label: "Delayed", value: "true" },
                { label: "On Track", value: "false" },
              ]}
              placeholder="Any Delay"
              value={isDelayed}
            />
          </FormField>
          <FormField label="CPC Involvement">
            <Select
              onChange={(event) => setCpcInvolved(toBooleanFilter(event.target.value))}
              options={[
                { label: "CPC Involved", value: "true" },
                { label: "No CPC", value: "false" },
              ]}
              placeholder="Any CPC"
              value={cpcInvolved}
            />
          </FormField>
        </section>

        <section className="filter-drawer-section">
          <h3>People &amp; Location</h3>
          <FormField label="Entity">
            <Select
              disabled={entities.isLoading}
              onChange={(event) => {
                setEntityId(event.target.value);
                setDepartmentId("");
                setOwnerUserId("");
              }}
              options={(entities.data ?? []).map((entity) => ({
                label: `${entity.code} - ${entity.name}`,
                value: entity.id,
              }))}
              placeholder="Any Entity"
              value={entityId}
            />
          </FormField>
          <FormField label="Department">
            <Select
              disabled={!entityId || departments.isLoading}
              onChange={(event) => setDepartmentId(event.target.value)}
              options={(departments.data ?? []).map((department) => ({
                label: department.name,
                value: department.id,
              }))}
              placeholder={entityId ? "Any Department" : "Select Entity First"}
              value={departmentId}
            />
          </FormField>
          <FormField label="Case Owner">
            <Select
              disabled={!entityId || assignableOwners.isLoading}
              onChange={(event) => setOwnerUserId(event.target.value)}
              options={ownerOptions}
              placeholder={entityId ? "Any Owner" : "Select Entity First"}
              value={ownerUserId}
            />
          </FormField>
        </section>

        <section className="filter-drawer-section">
          <h3>Classification</h3>
          <FormField label="Tender Type">
            <Select
              disabled={catalog.isLoading}
              onChange={(event) => setTenderTypeId(event.target.value)}
              options={(catalog.data?.tenderTypes ?? []).map((tenderType) => ({
                label: tenderType.name,
                value: tenderType.id,
              }))}
              placeholder="Any Tender Type"
              value={tenderTypeId}
            />
          </FormField>
          <FormField label="Budget Type">
            <Select
              disabled={catalog.isLoading}
              onChange={(event) => setBudgetTypeId(event.target.value)}
              options={budgetTypes.map((value) => ({ label: value.label, value: value.id }))}
              placeholder="Any Budget Type"
              value={budgetTypeId}
            />
          </FormField>
          <FormField label="Nature of Work">
            <Select
              disabled={catalog.isLoading}
              onChange={(event) => setNatureOfWorkId(event.target.value)}
              options={natureOfWork.map((value) => ({ label: value.label, value: value.id }))}
              placeholder="Any Nature"
              value={natureOfWorkId}
            />
          </FormField>
        </section>

        <section className="filter-drawer-section" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <h3>Date &amp; Value</h3>
          <div className="two-column">
            <FormField label="PR Date From">
              <TextInput onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
            </FormField>
            <FormField label="PR Date To">
              <TextInput onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
            </FormField>
          </div>
          <FormField label="Value Slab">
            <Select
              onChange={(event) => setValueSlab(toValueSlabFilter(event.target.value))}
              options={valueSlabOptions.filter((option) => option.value)}
              placeholder="Any Value"
              value={valueSlab}
            />
          </FormField>
        </section>
      </FilterDrawer>

      <Drawer isOpen={isColumnMenuOpen} onClose={() => setIsColumnMenuOpen(false)} title="Columns">
        <div className="filter-drawer-content">
          {allColumns.map((column) => (
            <Checkbox
              checked={visibleColumnKeys.includes(column.key)}
              disabled={column.key === "prId" || column.key === "actions" || column.key === "select"}
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
            rows={cases.data ?? []}
          />
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {(cases.data ?? []).length} cases
              {selectedRows.length ? ` · ${selectedRows.length} selected` : ""}
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
          onDeleted={() => setPreviewCaseId(null)}
          onEdit={() => {
            setEditCaseId(previewCaseId);
            setPreviewCaseId(null);
          }}
        />
      </Drawer>
    </section>
  );

  function clearFilters() {
    setBudgetTypeId("");
    setCpcInvolved("");
    setDateFrom("");
    setDateTo("");
    setDepartmentId("");
    setEntityId("");
    setIsDelayed("");
    setNatureOfWorkId("");
    setOwnerUserId("");
    setPriorityCase("");
    setQ("");
    setStatus("");
    setTenderTypeId("");
    setValueSlab("");
  }

  function currentViewState(): CaseViewState {
    return {
      budgetTypeId,
      cpcInvolved,
      dateFrom,
      dateTo,
      departmentId,
      entityId,
      isDelayed,
      natureOfWorkId,
      ownerUserId,
      priorityCase,
      q,
      status,
      tenderTypeId,
      valueSlab,
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
    setBudgetTypeId(view.state.budgetTypeId);
    setCpcInvolved(view.state.cpcInvolved);
    setDateFrom(view.state.dateFrom);
    setDateTo(view.state.dateTo);
    setDepartmentId(view.state.departmentId);
    setEntityId(view.state.entityId);
    setIsDelayed(view.state.isDelayed);
    setNatureOfWorkId(view.state.natureOfWorkId);
    setOwnerUserId(view.state.ownerUserId);
    setPriorityCase(view.state.priorityCase);
    setQ(view.state.q);
    setStatus(view.state.status);
    setTenderTypeId(view.state.tenderTypeId);
    setValueSlab(view.state.valueSlab);
    setVisibleColumnKeys(normalizeColumnKeys(view.state.visibleColumnKeys));
  }

  function toggleColumn(columnKey: CaseColumnKey, isVisible: boolean) {
    if (columnKey === "prId" || columnKey === "actions" || columnKey === "select") return;
    setVisibleColumnKeys((current) =>
      isVisible ? [...current, columnKey] : current.filter((key) => key !== columnKey),
    );
  }

  function toggleCaseSelection(caseId: string, isSelected: boolean) {
    setSelectedCaseIds((current) =>
      isSelected ? [...new Set([...current, caseId])] : current.filter((id) => id !== caseId),
    );
  }
}

function booleanFilter(value: BooleanFilter) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function toBooleanFilter(value: string): BooleanFilter {
  return value === "true" || value === "false" ? value : "";
}

function toValueSlabFilter(value: string): ValueSlabFilter {
  return value === "lt_10l" || value === "10l_1cr" || value === "1cr_10cr" || value === "gte_10cr" ? value : "";
}

function countActiveFilters(values: string[]) {
  return values.filter(Boolean).length;
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
  const requiredKeys = ["select", "prId", "actions"] satisfies CaseColumnKey[];
  for (const key of requiredKeys) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.length ? keys : defaultVisibleColumnKeys;
}

function exportCurrentView(
  rows: CaseListItem[],
  columns: Array<VirtualTableColumn<CaseListItem> & { key: CaseColumnKey }>,
) {
  const exportColumns = columns.filter((column) => column.key !== "actions" && column.key !== "select");
  const csvRows = [
    exportColumns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows.map((row) =>
      exportColumns
        .map((column) => escapeCsvValue(caseExportValue(row, column.key)))
        .join(","),
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `procuredesk-cases-${todayDateOnlyString()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function caseExportValue(row: CaseListItem, key: CaseColumnKey) {
  return caseExportValueByKey[key](row);
}

const caseExportValueByKey: Record<CaseColumnKey, (row: CaseListItem) => string> = {
  actions: () => "",
  description: (row) => row.prDescription ?? row.tenderName ?? "",
  entity: (row) => row.entityId,
  flags: (row) => caseExportFlags(row).join(" | "),
  prId: (row) => row.prId,
  select: () => "",
  stage: (row) => formatCaseStage(row.stageCode),
  status: (row) => row.status,
  updated: (row) => new Date(row.updatedAt).toLocaleDateString(),
};

function caseExportFlags(row: CaseListItem): string[] {
  return [
    isCaseOverdue(row) ? "Overdue" : "",
    row.priorityCase ? "Priority" : "",
    row.isDelayed ? "Delayed" : "",
    row.cpcInvolved ? "CPC" : "",
  ].filter(Boolean);
}

function isCaseOverdue(row: Pick<CaseListItem, "status" | "tentativeCompletionDate">) {
  const targetDate = toDateOnlyInputValue(row.tentativeCompletionDate);
  return Boolean(
    row.status === "running" &&
      targetDate &&
      targetDate < todayDateOnlyString(),
  );
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
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
