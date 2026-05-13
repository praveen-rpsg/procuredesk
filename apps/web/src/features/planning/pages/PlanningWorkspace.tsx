import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleAlert,
  Download,
  FilePlus2,
  Pencil,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createRcPoPlan,
  createTenderPlan,
  listEntities,
  listRcPoExpiry,
  listTenderPlans,
  updateTenderPlan,
  updateRcPoPlan,
  type EntityOption,
  type RcPoExpiryRow,
  type TenderPlanCase,
} from "../api/planningApi";
import { listAdminDepartments } from "../../admin/api/adminApi";
import { Button } from "../../../shared/ui/button/Button";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Checkbox } from "../../../shared/ui/form/Checkbox";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import {
  navigateToAppPath,
  useAppLocation,
} from "../../../shared/routing/appLocation";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  type VirtualTableColumn,
  VirtualTable,
} from "../../../shared/ui/table/VirtualTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";
import {
  formatDateOnly,
  todayDateOnlyString,
  toDateOnlyInputValue,
} from "../../../shared/utils/dateOnly";

const tenderColumns: VirtualTableColumn<TenderPlanCase>[] = [
  {
    key: "description",
    header: "Tender",
    render: (row) => row.tenderDescription ?? "-",
  },
  {
    key: "value",
    header: "Value [All Inclusive]",
    render: (row) => (row.valueRs == null ? "-" : row.valueRs.toLocaleString()),
  },
  {
    key: "planned",
    header: "Planned",
    render: (row) => formatDateOnly(row.plannedDate),
  },
  {
    key: "cpc",
    header: "CPC",
    render: (row) => (row.cpcInvolved ? "Yes" : "No"),
  },
];

function activeEntityOptions(entities: EntityOption[] | undefined) {
  return (entities ?? []).filter((entity) => entity.isActive);
}

type PlanningSectionKey = "expiry" | "tenders";
type RcPoExpiryDraft = {
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
};

const planningSections = [
  {
    description: "Upcoming tender pipeline and planning exports.",
    icon: CalendarClock,
    key: "tenders",
    label: "Tender Plans",
  },
  {
    description: "RC/PO expiry queue and renewal action tracking.",
    icon: CircleAlert,
    key: "expiry",
    label: "RC/PO Expiry",
  },
] satisfies Array<{
  description: string;
  icon: typeof CalendarClock;
  key: PlanningSectionKey;
  label: string;
}>;

const planningSectionPaths: Record<PlanningSectionKey, string> = {
  expiry: "/planning/rc-po-expiry",
  tenders: "/planning/tender-plans",
};

export function PlanningWorkspace() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const location = useAppLocation();
  const activeSection = planningSectionFromPath(location.pathname) ?? "tenders";
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [filterEntityId, setFilterEntityId] = useState("");
  const [filterDepartmentId, setFilterDepartmentId] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [expirySearch, setExpirySearch] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [tenderDescription, setTenderDescription] = useState("");
  const [tenderValue, setTenderValue] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [cpcInvolved, setCpcInvolved] = useState(false);
  const [rcDescription, setRcDescription] = useState("");
  const [awardedVendors, setAwardedVendors] = useState("");
  const [rcAmount, setRcAmount] = useState("");
  const [rcAwardDate, setRcAwardDate] = useState("");
  const [rcValidityDate, setRcValidityDate] = useState("");
  const [tentativeTenderingDate, setTentativeTenderingDate] = useState("");
  const [rcPoExpiryDrafts, setRcPoExpiryDrafts] = useState<
    Record<string, RcPoExpiryDraft>
  >({});
  const [createPlanModal, setCreatePlanModal] = useState<
    "rc" | "tender" | null
  >(null);
  const [editingTenderPlan, setEditingTenderPlan] =
    useState<TenderPlanCase | null>(null);
  const [editTenderDescription, setEditTenderDescription] = useState("");
  const [editTenderValue, setEditTenderValue] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editCpcInvolved, setEditCpcInvolved] = useState(false);
  const debouncedPlanSearch = useDebouncedValue(planSearch, 350);
  const debouncedExpirySearch = useDebouncedValue(expirySearch, 350);

  useEffect(() => {
    if (
      location.pathname === "/planning" ||
      location.pathname === "/planning/create"
    ) {
      navigateToAppPath(planningSectionPaths.tenders, { replace: true });
    }
  }, [location.pathname]);

  const entities = useQuery({ queryFn: listEntities, queryKey: ["entities"] });
  const activeEntities = useMemo(
    () => activeEntityOptions(entities.data),
    [entities.data],
  );
  const entityDisplayById = useMemo(
    () =>
      new Map(
        activeEntities.map((entity) => [
          entity.id,
          entity.code ? `${entity.code} - ${entity.name}` : entity.name,
        ]),
      ),
    [activeEntities],
  );
  const entityId = selectedEntityId || activeEntities[0]?.id || "";
  const formDepartments = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAdminDepartments(entityId),
    queryKey: ["planning-form-departments", entityId],
  });
  const filterDepartments = useQuery({
    enabled: Boolean(filterEntityId),
    queryFn: () => listAdminDepartments(filterEntityId),
    queryKey: ["planning-filter-departments", filterEntityId],
  });
  const departmentDisplayById = useMemo(
    () =>
      new Map(
        [
          ...(formDepartments.data ?? []),
          ...(filterDepartments.data ?? []),
        ].map((department) => [department.id, department.name]),
      ),
    [filterDepartments.data, formDepartments.data],
  );
  const tenderPlans = useQuery({
    queryFn: () =>
      listTenderPlans({
        departmentIds: filterDepartmentId ? [filterDepartmentId] : undefined,
        entityIds: filterEntityId ? [filterEntityId] : undefined,
        limit: 10,
        q: debouncedPlanSearch || undefined,
      }),
    queryKey: [
      "tender-plans",
      { debouncedPlanSearch, filterDepartmentId, filterEntityId },
    ],
  });
  const expiryRows = useQuery({
    queryFn: () =>
      listRcPoExpiry({
        days: expiryDays ? Number(expiryDays) : undefined,
        departmentIds: filterDepartmentId ? [filterDepartmentId] : undefined,
        entityIds: filterEntityId ? [filterEntityId] : undefined,
        includeCompleted: true,
        limit: 25,
        q: debouncedExpirySearch || undefined,
      }),
    queryKey: [
      "rc-po-expiry",
      {
        debouncedExpirySearch,
        expiryDays,
        filterDepartmentId,
        filterEntityId,
      },
    ],
  });

  const createTenderMutation = useMutation({
    mutationFn: () =>
      createTenderPlan({
        cpcInvolved,
        departmentId: selectedDepartmentId || null,
        entityId,
        plannedDate: plannedDate || null,
        tenderDescription: tenderDescription || null,
        valueRs: tenderValue || null,
      }),
    onSuccess: async () => {
      setTenderDescription("");
      setTenderValue("");
      setPlannedDate("");
      setCpcInvolved(false);
      setCreatePlanModal(null);
      await queryClient.invalidateQueries({ queryKey: ["tender-plans"] });
      notify({ message: "Tender plan added.", tone: "success" });
    },
  });

  const createRcMutation = useMutation({
    mutationFn: () =>
      createRcPoPlan({
        awardedVendors: awardedVendors || null,
        departmentId: selectedDepartmentId || null,
        entityId,
        rcPoAmount: rcAmount || null,
        rcPoAwardDate: rcAwardDate || null,
        rcPoValidityDate: rcValidityDate || null,
        tenderDescription: rcDescription || null,
        tentativeTenderingDate: tentativeTenderingDate || null,
      }),
    onSuccess: async () => {
      setRcDescription("");
      setAwardedVendors("");
      setRcAmount("");
      setRcAwardDate("");
      setRcValidityDate("");
      setTentativeTenderingDate("");
      setCreatePlanModal(null);
      await queryClient.invalidateQueries({ queryKey: ["rc-po-expiry"] });
      notify({ message: "RC/PO plan added.", tone: "success" });
    },
  });

  const updateRcMutation = useMutation({
    mutationFn: ({
      planId,
      payload,
    }: {
      planId: string;
      payload: Record<string, unknown>;
    }) => updateRcPoPlan(planId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rc-po-expiry"] });
      setRcPoExpiryDrafts({});
      notify({ message: "Expiry row updated.", tone: "success" });
    },
  });
  const updateTenderMutation = useMutation({
    mutationFn: () =>
      updateTenderPlan(editingTenderPlan?.id as string, {
        cpcInvolved: editCpcInvolved,
        plannedDate: editPlannedDate || null,
        tenderDescription: editTenderDescription || null,
        valueRs: editTenderValue || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tender-plans"] });
      setEditingTenderPlan(null);
      notify({ message: "Tender plan updated.", tone: "success" });
    },
  });

  const tenderPlanColumns = useMemo<VirtualTableColumn<TenderPlanCase>[]>(
    () => [
      ...tenderColumns,
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <Button variant="secondary" onClick={() => openTenderEdit(row)}>
            <Pencil size={18} />
            Edit
          </Button>
        ),
      },
    ],
    [],
  );

  const expiryColumns = useMemo<VirtualTableColumn<RcPoExpiryRow>[]>(
    () => [
      {
        key: "source",
        header: "Source",
        render: (row) => <RcPoSourceBadge row={row} />,
      },
      {
        key: "tender",
        header: "Tender Description",
        render: (row) => row.tenderDescription ?? "-",
      },
      {
        key: "entity",
        header: "Entity",
        render: (row) =>
          row.entityCode ??
          row.entityName ??
          entityDisplayById.get(row.entityId) ??
          row.entityId,
      },
      {
        key: "department",
        header: "Department",
        render: (row) =>
          row.departmentId == null
            ? "-"
            : (row.departmentName ??
              departmentDisplayById.get(row.departmentId) ??
              row.departmentId),
      },
      {
        key: "amount",
        header: "RC/PO Amount (Lakhs) [All Inclusive]",
        render: (row) => formatLakhs(row.rcPoAmount),
      },
      {
        key: "awardDate",
        header: "Award Date",
        render: (row) => formatDateCell(row.rcPoAwardDate),
      },
      {
        key: "validity",
        header: "Validity Date",
        render: (row) => row.rcPoValidityDate,
      },
      {
        key: "owner",
        header: "Owner",
        render: (row) => row.ownerFullName ?? row.ownerUserId ?? "-",
      },
      {
        key: "vendors",
        header: "Awarded Vendors",
        render: (row) => row.awardedVendors ?? "-",
      },
      {
        key: "tentativeTenderingDate",
        header: "Tentative Tendering Date",
        render: (row) => {
          const draft =
            rcPoExpiryDrafts[rcPoExpiryDraftKey(row)] ??
            rcPoExpiryDraftFromRow(row);
          return row.sourceType === "manual_plan" ? (
            <TextInput
              aria-label={`Tentative tendering date for ${row.tenderDescription ?? row.sourceId}`}
              onChange={(event) =>
                setRcPoExpiryDraft(row, {
                  tentativeTenderingDate: event.target.value || null,
                })
              }
              type="date"
              value={draft.tentativeTenderingDate ?? ""}
            />
          ) : (
            formatDateCell(row.tentativeTenderingDate)
          );
        },
      },
      {
        key: "floated",
        filterOptions: [
          { label: "Yes", value: "Yes" },
          { label: "No", value: "No" },
        ],
        filterValue: (row) => (row.tenderFloatedOrNotRequired ? "Yes" : "No"),
        header: "Tender Floated? or Not Required",
        render: (row) => {
          const draft =
            rcPoExpiryDrafts[rcPoExpiryDraftKey(row)] ??
            rcPoExpiryDraftFromRow(row);
          return row.sourceType === "manual_plan" ? (
            <Checkbox
              aria-label={`Tender floated or not required for ${row.tenderDescription ?? row.sourceId}`}
              checked={draft.tenderFloatedOrNotRequired}
              label=""
              onChange={(event) =>
                setRcPoExpiryDraft(row, {
                  tenderFloatedOrNotRequired: event.target.checked,
                })
              }
            />
          ) : row.tenderFloatedOrNotRequired ? (
            "Yes"
          ) : (
            "No"
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => {
          if (row.sourceType !== "manual_plan") return "-";
          const key = rcPoExpiryDraftKey(row);
          const draft = rcPoExpiryDrafts[key];
          const isSaving =
            updateRcMutation.isPending &&
            updateRcMutation.variables?.planId === row.sourceId;
          return (
            <Button
              disabled={!draft || isSaving}
              onClick={() => {
                if (!draft) return;
                updateRcMutation.mutate({
                  payload: draft,
                  planId: row.sourceId,
                });
              }}
              size="sm"
              variant={draft ? "primary" : "secondary"}
            >
              {isSaving ? "Saving" : "Save"}
            </Button>
          );
        },
      },
    ],
    [
      departmentDisplayById,
      entityDisplayById,
      rcPoExpiryDrafts,
      updateRcMutation,
    ],
  );

  function setRcPoExpiryDraft(
    row: RcPoExpiryRow,
    patch: Partial<RcPoExpiryDraft>,
  ) {
    setRcPoExpiryDrafts((current) => {
      const key = rcPoExpiryDraftKey(row);
      const currentDraft = current[key] ?? rcPoExpiryDraftFromRow(row);
      const nextDraft = { ...currentDraft, ...patch };
      if (isRcPoExpiryDraftUnchanged(row, nextDraft)) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: nextDraft };
    });
  }

  const onTenderSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;
    createTenderMutation.mutate();
  };

  const onRcSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId || !rcValidityDate) return;
    createRcMutation.mutate();
  };

  const onTenderEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingTenderPlan) updateTenderMutation.mutate();
  };

  function openTenderEdit(row: TenderPlanCase) {
    setEditingTenderPlan(row);
    setEditTenderDescription(row.tenderDescription ?? "");
    setEditTenderValue(row.valueRs == null ? "" : String(row.valueRs));
    setEditPlannedDate(toDateOnlyInputValue(row.plannedDate));
    setEditCpcInvolved(Boolean(row.cpcInvolved));
  }

  const clearPlanningFilters = () => {
    setFilterEntityId("");
    setFilterDepartmentId("");
    setPlanSearch("");
    setExpirySearch("");
    setExpiryDays("");
  };

  const renderPlanningFilters = (section: PlanningSectionKey) => (
    <div className="planning-inline-filters">
      <div
        className={`planning-filter-grid ${section === "tenders" ? "planning-filter-grid-tenders" : ""}`}
      >
        <FormField label="Entity">
          <select
            className="text-input"
            onChange={(event) => {
              setFilterEntityId(event.target.value);
              setFilterDepartmentId("");
            }}
            value={filterEntityId}
          >
            <option value="">All</option>
            {activeEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.code} - {entity.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Department">
          <select
            className="text-input"
            disabled={!filterEntityId || filterDepartments.isLoading}
            onChange={(event) => setFilterDepartmentId(event.target.value)}
            value={filterDepartmentId}
          >
            <option value="">All</option>
            {(filterDepartments.data ?? [])
              .filter((department) => department.isActive)
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
          </select>
        </FormField>
        {section === "tenders" ? (
          <FormField label="Search">
            <TextInput
              onChange={(event) => setPlanSearch(event.target.value)}
              placeholder="Description…"
              value={planSearch}
            />
          </FormField>
        ) : (
          <>
            <FormField label="Search">
              <div className="planning-search-input">
                <Search size={16} />
                <TextInput
                  onChange={(event) => setExpirySearch(event.target.value)}
                  placeholder="Contract, vendor, source…"
                  value={expirySearch}
                />
              </div>
            </FormField>
            <FormField label="Expiry Horizon">
              <select
                className="text-input"
                onChange={(event) => setExpiryDays(event.target.value)}
                value={expiryDays}
              >
                <option value="">All</option>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
                <option value="180">Next 180 days</option>
                <option value="365">Next 12 months</option>
              </select>
            </FormField>
          </>
        )}
      </div>
      <div className="planning-inline-filter-actions">
        {section === "expiry" ? (
          <div
            className="planning-filter-summary"
            aria-label="Expiry filter summary"
          >
            <span>{expiryDays || "All"} days</span>
            <span>Closed included</span>
          </div>
        ) : null}
        <Button size="sm" variant="ghost" onClick={clearPlanningFilters}>
          Clear
        </Button>
      </div>
    </div>
  );

  return (
    <section className="workspace-section">
      <PageHeader eyebrow="Planning" title="Tender Planning And RC/PO Expiry">
        Plan upcoming tenders, track expiring RC/PO contracts, and close expiry
        actions inline.
      </PageHeader>

      <section className="module-subnav-shell">
        <SecondaryNav
          activeKey={activeSection}
          ariaLabel="Planning sections"
          items={planningSections}
          onChange={(key) => navigateToAppPath(planningSectionPaths[key])}
        />
      </section>

      {entities.isLoading ? (
        <section className="state-panel">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  alignItems: "center",
                }}
              >
                <Skeleton height={13} width="20%" />
                <Skeleton height={13} width="45%" />
                <Skeleton height={13} width="15%" />
              </div>
            ))}
          </div>
        </section>
      ) : entities.error ? (
        <ErrorState
          message={entities.error.message}
          title="Could not load entities"
        />
      ) : (
        <div className="module-content-area">
          {activeSection === "tenders" ? (
            <section className="state-panel planning-grid-wide">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Pipeline</p>
                  <h2>Upcoming Tender Plans</h2>
                </div>
                <div className="planning-expiry-actions">
                  <Button
                    disabled={!entityId}
                    size="sm"
                    onClick={() => setCreatePlanModal("tender")}
                  >
                    <FilePlus2 size={16} />
                    Create Tender Plan
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => exportTenderPlans(tenderPlans.data ?? [])}
                  >
                    <Download size={16} />
                    Export
                  </Button>
                </div>
              </div>
              {renderPlanningFilters("tenders")}
              {tenderPlans.isLoading ? (
                <div style={{ display: "grid", gap: "var(--space-3)" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: "var(--space-4)",
                        alignItems: "center",
                      }}
                    >
                      <Skeleton height={13} width="38%" />
                      <Skeleton height={13} width="12%" />
                      <Skeleton height={13} width="12%" />
                      <Skeleton height={13} width="8%" />
                    </div>
                  ))}
                </div>
              ) : tenderPlans.error ? (
                <p className="inline-error">{tenderPlans.error.message}</p>
              ) : (
                <VirtualTable
                  columns={tenderPlanColumns}
                  emptyMessage="No tender plans found."
                  getRowKey={(row) => row.id}
                  maxHeight={480}
                  rows={tenderPlans.data ?? []}
                />
              )}
            </section>
          ) : null}

          {activeSection === "expiry" ? (
            <section className="state-panel planning-grid-wide">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Expiry</p>
                  <h2>RC/PO Expiry Queue</h2>
                </div>
                <div className="planning-expiry-actions">
                  <span className="planning-expiry-chip">
                    <SlidersHorizontal size={14} />
                    {expiryRows.data?.length ?? 0} visible
                  </span>
                  <Button
                    disabled={!entityId}
                    size="sm"
                    onClick={() => setCreatePlanModal("rc")}
                  >
                    <FilePlus2 size={16} />
                    Add RC/PO Plan
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => exportRcPoExpiry(expiryRows.data ?? [])}
                  >
                    <Download size={16} />
                    Export
                  </Button>
                </div>
              </div>
              {renderPlanningFilters("expiry")}
              {expiryRows.isLoading ? (
                <div style={{ display: "grid", gap: "var(--space-3)" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: "var(--space-4)",
                        alignItems: "center",
                      }}
                    >
                      <Skeleton height={13} width="30%" />
                      <Skeleton height={13} width="14%" />
                      <Skeleton height={13} width="18%" />
                      <Skeleton height={13} width="12%" />
                      <Skeleton height={13} width="10%" />
                    </div>
                  ))}
                </div>
              ) : expiryRows.error ? (
                <p className="inline-error">{expiryRows.error.message}</p>
              ) : (
                <VirtualTable
                  columns={expiryColumns}
                  emptyMessage="No expiring RC/PO rows found."
                  getRowKey={(row) => `${row.sourceType}-${row.sourceId}`}
                  maxHeight={520}
                  rowHeight={48}
                  rows={expiryRows.data ?? []}
                />
              )}
              {updateRcMutation.error ? (
                <p className="inline-error">{updateRcMutation.error.message}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={createPlanModal === "tender"}
        onClose={() => setCreatePlanModal(null)}
        title="Create Tender Plan"
      >
        <form className="stack-form" onSubmit={onTenderSubmit}>
          <FormField label="Entity">
            <select
              className="text-input"
              onChange={(event) => {
                setSelectedEntityId(event.target.value);
                setSelectedDepartmentId("");
              }}
              value={entityId}
            >
              {activeEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.code} - {entity.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Department">
            <select
              className="text-input"
              disabled={!entityId || formDepartments.isLoading}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
              value={selectedDepartmentId}
            >
              <option value="">All</option>
              {(formDepartments.data ?? [])
                .filter((department) => department.isActive)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Tender Description">
            <TextInput
              onChange={(event) => setTenderDescription(event.target.value)}
              value={tenderDescription}
            />
          </FormField>
          <div className="two-column">
            <FormField label="Value">
              <TextInput
                min="0"
                onChange={(event) => setTenderValue(event.target.value)}
                type="number"
                value={tenderValue}
              />
            </FormField>
            <FormField label="Planned Date">
              <TextInput
                onChange={(event) => setPlannedDate(event.target.value)}
                type="date"
                value={plannedDate}
              />
            </FormField>
          </div>
          <label className="checkbox-row">
            <input
              checked={cpcInvolved}
              onChange={(event) => setCpcInvolved(event.target.checked)}
              type="checkbox"
            />
            CPC involved
          </label>
          {createTenderMutation.error ? (
            <p className="inline-error">{createTenderMutation.error.message}</p>
          ) : null}
          <Button
            disabled={createTenderMutation.isPending || !entityId}
            type="submit"
          >
            Add Tender Plan
          </Button>
        </form>
      </Modal>

      <Modal
        isOpen={createPlanModal === "rc"}
        onClose={() => setCreatePlanModal(null)}
        size="wide"
        title="Add RC/PO Plan"
      >
        <form className="stack-form" onSubmit={onRcSubmit}>
          <FormField label="Entity">
            <select
              className="text-input"
              onChange={(event) => {
                setSelectedEntityId(event.target.value);
                setSelectedDepartmentId("");
              }}
              value={entityId}
            >
              {activeEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.code} - {entity.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Department">
            <select
              className="text-input"
              disabled={!entityId || formDepartments.isLoading}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
              value={selectedDepartmentId}
            >
              <option value="">All</option>
              {(formDepartments.data ?? [])
                .filter((department) => department.isActive)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Contract Description">
            <TextInput
              onChange={(event) => setRcDescription(event.target.value)}
              value={rcDescription}
            />
          </FormField>
          <FormField label="Awarded Vendors">
            <TextInput
              onChange={(event) => setAwardedVendors(event.target.value)}
              value={awardedVendors}
            />
          </FormField>
          <div className="two-column">
            <FormField label="RC/PO Amount (Rs.) [All Inclusive]">
              <TextInput
                min="0"
                onChange={(event) => setRcAmount(event.target.value)}
                type="number"
                value={rcAmount}
              />
            </FormField>
            <FormField label="Validity Date">
              <TextInput
                onChange={(event) => setRcValidityDate(event.target.value)}
                required
                type="date"
                value={rcValidityDate}
              />
            </FormField>
          </div>
          <div className="two-column">
            <FormField label="Award Date">
              <TextInput
                onChange={(event) => setRcAwardDate(event.target.value)}
                type="date"
                value={rcAwardDate}
              />
            </FormField>
            <FormField label="Tentative Tendering">
              <TextInput
                onChange={(event) =>
                  setTentativeTenderingDate(event.target.value)
                }
                type="date"
                value={tentativeTenderingDate}
              />
            </FormField>
          </div>
          {createRcMutation.error ? (
            <p className="inline-error">{createRcMutation.error.message}</p>
          ) : null}
          <Button
            disabled={createRcMutation.isPending || !entityId}
            type="submit"
          >
            Add RC/PO Plan
          </Button>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(editingTenderPlan)}
        onClose={() => setEditingTenderPlan(null)}
        title="Edit Tender Plan"
      >
        <form className="stack-form" onSubmit={onTenderEditSubmit}>
          <FormField label="Tender Description">
            <TextInput
              maxLength={5000}
              onChange={(event) => setEditTenderDescription(event.target.value)}
              value={editTenderDescription}
            />
          </FormField>
          <div className="two-column">
            <FormField label="Value">
              <TextInput
                min="0"
                onChange={(event) => setEditTenderValue(event.target.value)}
                type="number"
                value={editTenderValue}
              />
            </FormField>
            <FormField label="Planned Date">
              <TextInput
                onChange={(event) => setEditPlannedDate(event.target.value)}
                type="date"
                value={editPlannedDate}
              />
            </FormField>
          </div>
          <label className="checkbox-row">
            <input
              checked={editCpcInvolved}
              onChange={(event) => setEditCpcInvolved(event.target.checked)}
              type="checkbox"
            />
            CPC involved
          </label>
          {updateTenderMutation.error ? (
            <p className="inline-error">{updateTenderMutation.error.message}</p>
          ) : null}
          <Button disabled={updateTenderMutation.isPending} type="submit">
            Save Tender Plan
          </Button>
        </form>
      </Modal>
    </section>
  );
}

function exportTenderPlans(rows: TenderPlanCase[]) {
  downloadCsv(
    "procuredesk-tender-plans",
    ["Tender", "Value", "Planned Date", "CPC"],
    rows.map((row) => [
      row.tenderDescription ?? "",
      row.valueRs == null ? "" : String(row.valueRs),
      row.plannedDate ?? "",
      row.cpcInvolved ? "Yes" : "No",
    ]),
  );
}

function exportRcPoExpiry(rows: RcPoExpiryRow[]) {
  downloadCsv(
    "procuredesk-rc-po-expiry",
    [
      "Contract",
      "Source",
      "Vendors",
      "Validity Date",
      "Days To Expiry",
      "Urgency",
      "Tentative Tendering",
      "Floated",
    ],
    rows.map((row) => [
      row.tenderDescription ?? "",
      rcPoSourceLabel(row),
      row.awardedVendors ?? "",
      row.rcPoValidityDate,
      row.daysToExpiry == null ? "" : String(row.daysToExpiry),
      row.urgency,
      row.tentativeTenderingDate ?? "",
      row.tenderFloatedOrNotRequired ? "Yes" : "No",
    ]),
  );
}

function RcPoSourceBadge({ row }: { row: RcPoExpiryRow }) {
  if (row.sourceOrigin === "bulk_upload") {
    return <StatusBadge tone="warning">Bulk Upload</StatusBadge>;
  }
  if (row.sourceOrigin === "manual_entry") {
    return <StatusBadge tone="info">Manual Entry</StatusBadge>;
  }
  return <StatusBadge>TenderDB</StatusBadge>;
}

function rcPoSourceLabel(row: RcPoExpiryRow) {
  if (row.sourceOrigin === "bulk_upload") return "Bulk Upload";
  if (row.sourceOrigin === "manual_entry") return "Manual Entry";
  return "TenderDB";
}

function rcPoExpiryDraftKey(row: RcPoExpiryRow): string {
  return `${row.sourceType}:${row.sourceId}`;
}

function rcPoExpiryDraftFromRow(row: RcPoExpiryRow): RcPoExpiryDraft {
  return {
    tenderFloatedOrNotRequired: row.tenderFloatedOrNotRequired,
    tentativeTenderingDate:
      toDateOnlyInputValue(row.tentativeTenderingDate) || null,
  };
}

function isRcPoExpiryDraftUnchanged(
  row: RcPoExpiryRow,
  draft: RcPoExpiryDraft,
): boolean {
  const baseline = rcPoExpiryDraftFromRow(row);
  return (
    baseline.tenderFloatedOrNotRequired === draft.tenderFloatedOrNotRequired &&
    baseline.tentativeTenderingDate === draft.tentativeTenderingDate
  );
}

function formatDateCell(value: string | null | undefined) {
  return value ?? "-";
}

function formatLakhs(value: number | null | undefined) {
  if (value == null) return "-";
  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value;
  return `${(normalizedValue / 100000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function downloadCsv(
  filenamePrefix: string,
  headers: string[],
  rows: string[][],
) {
  const csvRows = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${todayDateOnlyString()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function planningSectionFromPath(pathname: string): PlanningSectionKey | null {
  const match = Object.entries(planningSectionPaths).find(
    ([, path]) => pathname === path,
  );
  return match?.[0] as PlanningSectionKey | null;
}
