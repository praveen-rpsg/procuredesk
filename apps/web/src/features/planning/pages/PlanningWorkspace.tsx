import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleAlert,
  Download,
  FilePlus2,
  Pencil,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  archiveTenderPlan,
  createTenderPlan,
  listEntities,
  listTenderPlans,
  updateTenderPlan,
  type EntityOption,
  type TenderPlanCase,
} from "../api/planningApi";
import {
  getCatalogSnapshot,
  listAdminDepartments,
} from "../../admin/api/adminApi";
import {
  CreateCaseForm,
  type CreateCaseFormInitialValues,
} from "../../procurement-cases/components/CreateCaseForm";
import { Button } from "../../../shared/ui/button/Button";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import {
  navigateToAppPath,
  useAppLocation,
} from "../../../shared/routing/appLocation";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
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
    key: "entity",
    header: "Entity",
    render: (row) =>
      [row.entityCode, row.entityName].filter(Boolean).join(" - ") || "-",
  },
  {
    key: "department",
    header: "User Department",
    render: (row) => row.departmentName ?? "-",
  },
  {
    key: "nature",
    header: "Nature of Work",
    render: (row) => row.natureOfWorkLabel ?? "-",
  },
  {
    key: "description",
    header: "Tender Description",
    render: (row) => row.tenderDescription ?? "-",
  },
  {
    key: "value",
    header: "Value (Rs.) [All Inclusive]",
    render: (row) => (row.valueRs == null ? "-" : row.valueRs.toLocaleString()),
  },
  {
    key: "planned",
    header: "Planned Date",
    render: (row) => formatDateOnly(row.plannedDate),
  },
  {
    key: "cpc",
    header: "CPC Involved?",
    render: (row) => (row.cpcInvolved ? "Yes" : "No"),
  },
];

function activeEntityOptions(entities: EntityOption[] | undefined) {
  return (entities ?? []).filter((entity) => entity.isActive);
}

type PlanningSectionKey = "expiry" | "tenders";
type CreatingCaseFromPlan = {
  initialValues: CreateCaseFormInitialValues;
  plan: TenderPlanCase;
};

const planningSections = [
  {
    description: "Upcoming tender pipeline and planning exports.",
    icon: CalendarClock,
    key: "tenders",
    label: "Tender Plans",
  },
  {
    description: "Open the RC/PO expiry report.",
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
  expiry: "/reports/rc-po-expiry",
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
  const [filterNatureOfWorkId, setFilterNatureOfWorkId] = useState("");
  const [filterCpcInvolved, setFilterCpcInvolved] = useState(false);
  const [natureOfWorkId, setNatureOfWorkId] = useState("");
  const [tenderDescription, setTenderDescription] = useState("");
  const [tenderValue, setTenderValue] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [cpcInvolved, setCpcInvolved] = useState(false);
  const [createPlanModal, setCreatePlanModal] = useState<"tender" | null>(null);
  const [editingTenderPlan, setEditingTenderPlan] =
    useState<TenderPlanCase | null>(null);
  const [creatingCaseFromPlan, setCreatingCaseFromPlan] =
    useState<CreatingCaseFromPlan | null>(null);
  const [editNatureOfWorkId, setEditNatureOfWorkId] = useState("");
  const [editTenderDescription, setEditTenderDescription] = useState("");
  const [editTenderValue, setEditTenderValue] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editCpcInvolved, setEditCpcInvolved] = useState(false);

  useEffect(() => {
    if (location.pathname === "/planning/rc-po-expiry") {
      navigateToAppPath(planningSectionPaths.expiry, { replace: true });
      return;
    }
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
  const entityId = selectedEntityId || activeEntities[0]?.id || "";
  const formDepartments = useQuery({
    enabled: Boolean(entityId),
    queryFn: () => listAdminDepartments(entityId),
    queryKey: ["planning-form-departments", entityId],
  });
  const catalog = useQuery({
    queryFn: getCatalogSnapshot,
    queryKey: ["catalog-snapshot"],
  });
  const natureOfWorkOptions = useMemo(
    () =>
      (catalog.data?.referenceValues ?? []).filter(
        (value) => value.categoryCode === "nature_of_work" && value.isActive,
      ),
    [catalog.data?.referenceValues],
  );
  const tenderPlans = useQuery({
    queryFn: () =>
      listTenderPlans({
        cpcInvolved: filterCpcInvolved ? true : undefined,
        entityIds: filterEntityId ? [filterEntityId] : undefined,
        limit: 100,
        natureOfWorkIds: filterNatureOfWorkId
          ? [filterNatureOfWorkId]
          : undefined,
      }),
    queryKey: [
      "tender-plans",
      {
        filterCpcInvolved,
        filterEntityId,
        filterNatureOfWorkId,
      },
    ],
  });

  const createTenderMutation = useMutation({
    mutationFn: () =>
      createTenderPlan({
        cpcInvolved,
        departmentId: selectedDepartmentId || null,
        entityId,
        natureOfWorkId: natureOfWorkId || null,
        plannedDate: plannedDate || null,
        tenderDescription: tenderDescription || null,
        valueRs: tenderValue || null,
      }),
    onSuccess: async () => {
      setTenderDescription("");
      setNatureOfWorkId("");
      setTenderValue("");
      setPlannedDate("");
      setCpcInvolved(false);
      setCreatePlanModal(null);
      await queryClient.invalidateQueries({ queryKey: ["tender-plans"] });
      notify({ message: "Tender plan added.", tone: "success" });
    },
  });

  const updateTenderMutation = useMutation({
    mutationFn: () =>
      updateTenderPlan(editingTenderPlan?.id as string, {
        cpcInvolved: editCpcInvolved,
        natureOfWorkId: editNatureOfWorkId || null,
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

  const archiveTenderMutation = useMutation({
    mutationFn: archiveTenderPlan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tender-plans"] });
    },
  });

  const tenderPlanColumns = useMemo<VirtualTableColumn<TenderPlanCase>[]>(
    () => [
      ...tenderColumns,
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="planning-row-actions">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openCreateCaseFromPlan(row)}
            >
              <FilePlus2 size={16} />
              Create Case
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openTenderEdit(row)}
            >
              <Pencil size={16} />
              Edit
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const onTenderSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;
    createTenderMutation.mutate();
  };

  const onTenderEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingTenderPlan) updateTenderMutation.mutate();
  };

  function openTenderEdit(row: TenderPlanCase) {
    setEditingTenderPlan(row);
    setEditNatureOfWorkId(row.natureOfWorkId ?? "");
    setEditTenderDescription(row.tenderDescription ?? "");
    setEditTenderValue(row.valueRs == null ? "" : String(row.valueRs));
    setEditPlannedDate(toDateOnlyInputValue(row.plannedDate));
    setEditCpcInvolved(Boolean(row.cpcInvolved));
  }

  function openCreateCaseFromPlan(row: TenderPlanCase) {
    setCreatingCaseFromPlan({
      initialValues: {
        cpcInvolved: Boolean(row.cpcInvolved),
        departmentId: row.departmentId ?? "",
        entityId: row.entityId,
        natureOfWorkId: row.natureOfWorkId ?? "",
        prDescription: row.tenderDescription ?? "",
        prReceiptDate: toDateOnlyInputValue(row.plannedDate),
        prValue: row.valueRs == null ? "" : String(row.valueRs),
        tentativeCompletionDate: toDateOnlyInputValue(row.plannedDate),
      },
      plan: row,
    });
  }

  const clearPlanningFilters = () => {
    setFilterEntityId("");
    setFilterNatureOfWorkId("");
    setFilterCpcInvolved(false);
  };

  const renderPlanningFilters = () => (
    <div className="planning-inline-filters">
      <div className="planning-filter-grid planning-filter-grid-tenders">
        <FormField label="Entity">
          <select
            className="text-input"
            onChange={(event) => {
              setFilterEntityId(event.target.value);
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
        <FormField label="Nature of Work">
          <select
            className="text-input"
            disabled={catalog.isLoading}
            onChange={(event) => setFilterNatureOfWorkId(event.target.value)}
            value={filterNatureOfWorkId}
          >
            <option value="">All</option>
            {natureOfWorkOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="planning-filter-toggle">
          <label className="checkbox-row">
            <input
              checked={filterCpcInvolved}
              onChange={(event) => setFilterCpcInvolved(event.target.checked)}
              type="checkbox"
            />
            CPC Involved?
          </label>
        </div>
      </div>
      <div className="planning-inline-filter-actions">
        <Button size="sm" variant="ghost" onClick={clearPlanningFilters}>
          Clear
        </Button>
      </div>
    </div>
  );

  return (
    <section className="workspace-section">
      <PageHeader eyebrow="Planning" title="Tender Planning">
        Plan upcoming tenders and export the tender planning pipeline.
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
              {renderPlanningFilters()}
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
          <FormField label="Nature of Work">
            <select
              className="text-input"
              disabled={catalog.isLoading}
              onChange={(event) => setNatureOfWorkId(event.target.value)}
              value={natureOfWorkId}
            >
              <option value="">Select nature of work</option>
              {natureOfWorkOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
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
        isOpen={Boolean(editingTenderPlan)}
        onClose={() => setEditingTenderPlan(null)}
        title="Edit Tender Plan"
      >
        <form className="stack-form" onSubmit={onTenderEditSubmit}>
          <FormField label="Nature of Work">
            <select
              className="text-input"
              disabled={catalog.isLoading}
              onChange={(event) => setEditNatureOfWorkId(event.target.value)}
              value={editNatureOfWorkId}
            >
              <option value="">Select nature of work</option>
              {natureOfWorkOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
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

      <Modal
        isOpen={Boolean(creatingCaseFromPlan)}
        onClose={() => setCreatingCaseFromPlan(null)}
        size="wide"
        title="Create Case"
      >
        {creatingCaseFromPlan ? (
          <CreateCaseForm
            initialValues={creatingCaseFromPlan.initialValues}
            onCreated={async (caseId) => {
              try {
                await archiveTenderMutation.mutateAsync(
                  creatingCaseFromPlan.plan.id,
                );
              } catch (error) {
                notify({
                  message:
                    error instanceof Error
                      ? error.message
                      : "Case created, but tender plan could not be removed.",
                  tone: "warning",
                });
              }
              setCreatingCaseFromPlan(null);
              navigateToAppPath(`/cases/${caseId}`);
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function exportTenderPlans(rows: TenderPlanCase[]) {
  downloadCsv(
    "procuredesk-tender-plans",
    [
      "Entity",
      "User Department",
      "Nature of Work",
      "Tender Description",
      "Value (Rs.) [All Inclusive]",
      "Planned Date",
      "CPC Involved?",
    ],
    rows.map((row) => [
      [row.entityCode, row.entityName].filter(Boolean).join(" - "),
      row.departmentName ?? "",
      row.natureOfWorkLabel ?? "",
      row.tenderDescription ?? "",
      row.valueRs == null ? "" : String(row.valueRs),
      row.plannedDate ?? "",
      row.cpcInvolved ? "Yes" : "No",
    ]),
  );
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
