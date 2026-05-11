import { useQuery } from "@tanstack/react-query";
import { Eye, FileClock, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  getAdminAuditFilterMetadata,
  listAdminAuditEvents,
  type AuditEvent,
} from "./adminAuditApi";
import { Button } from "../../../shared/ui/button/Button";
import { ComboboxSelect, type ComboboxOption } from "../../../shared/ui/form/ComboboxSelect";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { IconButton } from "../../../shared/ui/icon-button/IconButton";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";

const pageSize = 50;

type AuditFilters = {
  action: string;
  offset: number;
  q: string;
  targetType: string;
};

const emptyFilters: AuditFilters = {
  action: "",
  offset: 0,
  q: "",
  targetType: "",
};

export function AdminAuditPage() {
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(emptyFilters);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const metadata = useQuery({
    queryFn: getAdminAuditFilterMetadata,
    queryKey: ["admin-audit-filter-metadata"],
  });
  const auditEvents = useQuery({
    queryFn: () =>
      listAdminAuditEvents({
        action: appliedFilters.action || undefined,
        limit: pageSize,
        offset: appliedFilters.offset,
        q: appliedFilters.q.trim() || undefined,
        targetType: appliedFilters.targetType || undefined,
      }),
    queryKey: ["admin-audit-events", appliedFilters],
  });
  const actionOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: "All", value: "" },
      ...(metadata.data?.actions ?? []).map((action) => ({
        description: describeAction(action),
        label: formatAuditLabel(action),
        value: action,
      })),
    ],
    [metadata.data?.actions],
  );
  const targetTypeOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: "All", value: "" },
      ...(metadata.data?.targetTypes ?? []).map((targetType) => ({
        label: formatAuditLabel(targetType),
        value: targetType,
      })),
    ],
    [metadata.data?.targetTypes],
  );
  const columns = useMemo<DataTableColumn<AuditEvent>[]>(
    () => auditColumns((event) => setSelectedEvent(event)),
    [],
  );

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ ...draftFilters, offset: 0, q: draftFilters.q.trim() });
  };

  const clearFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };

  const rows = auditEvents.data ?? [];

  return (
    <section className="admin-section">
      <PageHeader eyebrow="Governance" title="Audit Logs">
        Review security-sensitive and business-critical activity by action, object type, actor, IP address, and event ID.
      </PageHeader>

      <div className="admin-stack">
        <section className="audit-summary-band">
          <div className="tender-type-rule-copy">
            <span className="admin-section-nav-icon">
              <FileClock size={18} />
            </span>
            <div>
              <p className="eyebrow">Traceability</p>
              <h2>Tenant Activity Trail</h2>
              <p>
                <strong>{rows.length}</strong>
                <span>visible events</span>
                <strong>{appliedFilters.offset + 1}</strong>
                <span>page start</span>
              </p>
            </div>
          </div>
          <StatusBadge tone="success">Admin only</StatusBadge>
        </section>

        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Filters</p>
              <h2>Find Events</h2>
            </div>
            <SlidersHorizontal size={20} />
          </div>
          <form className="audit-filter-grid" onSubmit={applyFilters}>
            <FormField label="Action">
              <ComboboxSelect
                emptyMessage="No actions found."
                onChange={(value) => setDraftFilters((current) => ({ ...current, action: value }))}
                options={actionOptions}
                placeholder="All"
                searchPlaceholder="Search actions..."
                value={draftFilters.action}
              />
            </FormField>
            <FormField label="Object Type">
              <ComboboxSelect
                emptyMessage="No object types found."
                onChange={(value) => setDraftFilters((current) => ({ ...current, targetType: value }))}
                options={targetTypeOptions}
                placeholder="All"
                searchPlaceholder="Search object types..."
                value={draftFilters.targetType}
              />
            </FormField>
            <FormField label="Search Summary">
              <TextInput
                onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Search actor, action, object, or summary..."
                value={draftFilters.q}
              />
            </FormField>
            <div className="audit-filter-actions">
              <Button type="submit">
                <Search size={16} />
                Filter
              </Button>
              <Button variant="secondary" onClick={clearFilters} type="button">
                <RotateCcw size={16} />
                Clear
              </Button>
            </div>
          </form>
        </section>

        <section className="state-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Events</p>
              <h2>Audit Event Directory</h2>
            </div>
            <StatusBadge tone="neutral">UTC timestamps</StatusBadge>
          </div>
          {auditEvents.isLoading || metadata.isLoading ? (
            <Skeleton height={20} />
          ) : auditEvents.error ? (
            <p className="inline-error">{auditEvents.error.message}</p>
          ) : metadata.error ? (
            <p className="inline-error">{metadata.error.message}</p>
          ) : (
            <>
              <DataTable
                columns={columns}
                emptyMessage="No audit events match the selected filters."
                getRowKey={(row) => row.id}
                rows={rows}
              />
              <div className="audit-pagination">
                <Button
                  variant="secondary"
                  disabled={appliedFilters.offset === 0}
                  onClick={() =>
                    setAppliedFilters((current) => ({
                      ...current,
                      offset: Math.max(0, current.offset - pageSize),
                    }))
                  }
                >
                  Previous
                </Button>
                <span>
                  Showing {appliedFilters.offset + 1} - {appliedFilters.offset + rows.length}
                </span>
                <Button
                  variant="secondary"
                  disabled={rows.length < pageSize}
                  onClick={() =>
                    setAppliedFilters((current) => ({
                      ...current,
                      offset: current.offset + pageSize,
                    }))
                  }
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        size="wide"
        title="Audit Event Details"
      >
        {selectedEvent ? <AuditEventDetail event={selectedEvent} /> : null}
      </Modal>
    </section>
  );
}

function auditColumns(onView: (event: AuditEvent) => void): DataTableColumn<AuditEvent>[] {
  return [
    {
      key: "timestamp",
      header: "Timestamp (UTC)",
      render: (row) => <span className="mono-cell">{formatUtc(row.occurredAt)}</span>,
    },
    {
      key: "user",
      header: "User",
      render: (row) => (
        <span className="audit-user-cell">
          <strong>{row.actorUsername ?? "System"}</strong>
          {row.actorFullName && row.actorFullName !== row.actorUsername ? <small>{row.actorFullName}</small> : null}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => <StatusBadge tone={auditActionTone(row.action)}>{formatAuditLabel(row.action)}</StatusBadge>,
    },
    { key: "type", header: "Type", render: (row) => formatAuditLabel(row.targetType) },
    { key: "id", header: "ID", render: (row) => <span className="mono-cell">{shortId(row.targetId)}</span> },
    { key: "summary", header: "Summary", render: (row) => <span className="audit-summary-cell">{row.summary}</span> },
    { key: "ip", header: "IP", render: (row) => <span className="mono-cell">{row.ipAddress ?? "-"}</span> },
    { key: "request", header: "Event", render: (row) => <span className="mono-cell">{shortId(row.requestId)}</span> },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <IconButton aria-label="View audit event" onClick={() => onView(row)} tooltip="View details">
          <Eye size={17} />
        </IconButton>
      ),
    },
  ];
}

function AuditEventDetail({ event }: { event: AuditEvent }) {
  return (
    <div className="audit-detail">
      <dl className="audit-detail-grid">
        <div>
          <dt>Timestamp</dt>
          <dd>{formatUtc(event.occurredAt)}</dd>
        </div>
        <div>
          <dt>Actor</dt>
          <dd>{event.actorFullName ?? event.actorUsername ?? "System"}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{formatAuditLabel(event.action)}</dd>
        </div>
        <div>
          <dt>Object</dt>
          <dd>{formatAuditLabel(event.targetType)}</dd>
        </div>
        <div>
          <dt>Object ID</dt>
          <dd>{event.targetId ?? "-"}</dd>
        </div>
        <div>
          <dt>IP Address</dt>
          <dd>{event.ipAddress ?? "-"}</dd>
        </div>
        <div>
          <dt>Event ID</dt>
          <dd>{event.requestId}</dd>
        </div>
        <div>
          <dt>User Agent</dt>
          <dd>{event.userAgent ?? "-"}</dd>
        </div>
      </dl>
      <section className="audit-detail-summary">
        <h3>Summary</h3>
        <p>{event.summary}</p>
      </section>
      <section className="audit-detail-summary">
        <h3>Details</h3>
        <pre className="json-block">{JSON.stringify(event.details, null, 2)}</pre>
      </section>
    </div>
  );
}

function auditActionTone(action: string) {
  const normalized = action.toLowerCase();
  if (["delete", "restore", "revoke", "login_failed"].some((term) => normalized.includes(term))) return "danger";
  if (["update", "change", "assign", "commit"].some((term) => normalized.includes(term))) return "warning";
  if (["create", "login", "queue"].some((term) => normalized.includes(term))) return "success";
  return "neutral";
}

function describeAction(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("login")) return "Authentication event";
  if (normalized.includes("delete")) return "Removal or soft-delete event";
  if (normalized.includes("update")) return "Record change event";
  if (normalized.includes("create")) return "New record event";
  return "Tenant activity";
}

function formatAuditLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatUtc(value: string) {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function shortId(value: string | null) {
  return value ? value.slice(0, 12) : "-";
}
