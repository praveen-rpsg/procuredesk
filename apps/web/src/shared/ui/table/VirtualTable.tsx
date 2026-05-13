import type { ReactNode, UIEvent } from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from "lucide-react";

import {
  canFilterColumn,
  canSortColumn,
  nextSortState,
  useProcessedTableRows,
  type TableFilterOption,
  type TableSortDirection,
  type TableSortState,
} from "./tableControls";

export type VirtualTableColumn<TRow> = {
  enableFilter?: boolean;
  enableSort?: boolean;
  filterOptions?: TableFilterOption[];
  filterValue?: (row: TRow) => ReactNode;
  key: string;
  header: ReactNode;
  render: (row: TRow) => ReactNode;
  sortValue?: (row: TRow) => ReactNode;
};

type VirtualTableProps<TRow> = {
  ariaLabel?: string;
  columns: VirtualTableColumn<TRow>[];
  emptyMessage?: string;
  getRowKey: (row: TRow) => string;
  maxHeight?: number;
  onRowClick?: (row: TRow) => void;
  rowHeight?: number;
  rows: TRow[];
};

export function VirtualTable<TRow>({
  ariaLabel = "Virtualized data table",
  columns,
  emptyMessage = "No records found.",
  getRowKey,
  maxHeight = 520,
  onRowClick,
  rowHeight = 48,
  rows,
}: VirtualTableProps<TRow>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);
  const [sortState, setSortState] = useState<TableSortState>(null);
  const processedRows = useProcessedTableRows(rows, columns, filters, sortState);
  const overscan = 6;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(maxHeight / rowHeight) + overscan * 2;
  const visibleEnd = Math.min(processedRows.length, visibleStart + visibleCount);
  const visibleRows = useMemo(() => processedRows.slice(visibleStart, visibleEnd), [processedRows, visibleEnd, visibleStart]);
  const topSpacerHeight = visibleStart * rowHeight;
  const bottomSpacerHeight = Math.max(0, (processedRows.length - visibleEnd) * rowHeight);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };
  const setColumnFilter = (key: string, value: string) => {
    setScrollTop(0);
    setFilters((current) => {
      const next = { ...current };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  return (
    <div
      aria-label={ariaLabel}
      className="table-shell virtual-table-shell"
      onScroll={handleScroll}
      role="region"
      style={{ maxHeight }}
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                aria-sort={
                  sortState?.key === column.key
                    ? sortState.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : canSortColumn(column)
                      ? "none"
                      : undefined
                }
              >
                <TableHeader
                  canFilter={canFilterColumn(column)}
                  canSort={canSortColumn(column)}
                  filterOptions={column.filterOptions}
                  filterValue={filters[column.key] ?? ""}
                  header={column.header}
                  isFilterOpen={filterColumnKey === column.key}
                  onClearFilter={() => setColumnFilter(column.key, "")}
                  onFilterChange={(value) => setColumnFilter(column.key, value)}
                  onSort={() => {
                    setScrollTop(0);
                    setSortState((current) => nextSortState(column.key, current));
                  }}
                  onToggleFilter={() => setFilterColumnKey((current) => (current === column.key ? null : column.key))}
                  sortDirection={sortState?.key === column.key ? sortState.direction : undefined}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {processedRows.length === 0 ? (
            <tr>
              <td className="table-empty-cell" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : (
            <>
              {topSpacerHeight > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: topSpacerHeight, padding: 0 }} />
                </tr>
              ) : null}
              {visibleRows.map((row) => (
                <tr
                  className={onRowClick ? "table-row-clickable" : undefined}
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{ height: rowHeight }}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
              {bottomSpacerHeight > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: bottomSpacerHeight, padding: 0 }} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TableHeader({
  canFilter,
  canSort,
  filterOptions,
  filterValue,
  header,
  isFilterOpen,
  onClearFilter,
  onFilterChange,
  onSort,
  onToggleFilter,
  sortDirection,
}: {
  canFilter: boolean;
  canSort: boolean;
  filterOptions?: TableFilterOption[] | undefined;
  filterValue: string;
  header: ReactNode;
  isFilterOpen: boolean;
  onClearFilter: () => void;
  onFilterChange: (value: string) => void;
  onSort: () => void;
  onToggleFilter: () => void;
  sortDirection?: TableSortDirection | undefined;
}) {
  const headerLabel = textFromNode(header) || "column";
  const hasActiveFilter = Boolean(filterValue.trim());
  const hasActiveSort = Boolean(sortDirection);
  const isFilterHighlighted = hasActiveFilter || isFilterOpen;

  if (!canFilter && !canSort) return <span>{header}</span>;
  return (
    <div className="table-header-control">
      <button
        aria-label={canSort ? `Sort by ${headerLabel}` : undefined}
        aria-pressed={canSort ? hasActiveSort : undefined}
        className={`table-sort-button ${hasActiveSort ? "table-sort-button-active" : ""}`.trim()}
        disabled={!canSort}
        onClick={canSort ? onSort : undefined}
        type="button"
      >
        <span>{header}</span>
        {canSort ? <SortIcon direction={sortDirection} /> : null}
      </button>
      {canFilter ? (
        <button
          aria-label={`Filter ${headerLabel}`}
          aria-expanded={isFilterOpen}
          aria-pressed={isFilterHighlighted}
          className={`table-filter-button ${isFilterHighlighted ? "table-filter-button-active" : ""}`.trim()}
          onClick={onToggleFilter}
          type="button"
        >
          <Filter aria-hidden="true" size={13} />
        </button>
      ) : null}
      {isFilterOpen ? (
        <div className="table-filter-popover">
          {filterOptions?.length ? (
            <select
              autoFocus
              aria-label={`Filter ${headerLabel}`}
              onChange={(event) => onFilterChange(event.target.value)}
              value={filterValue}
            >
              <option value="">All {headerLabel}</option>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={`Filter ${headerLabel}`}
              value={filterValue}
            />
          )}
          <button aria-label={`Clear ${headerLabel} filter`} onClick={onClearFilter} type="button">
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function textFromNode(value: ReactNode): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).join(" ");
  return "";
}

function SortIcon({ direction }: { direction?: TableSortDirection | undefined }) {
  if (direction === "asc") return <ArrowUp aria-hidden="true" size={14} />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" size={14} />;
  return <ChevronsUpDown aria-hidden="true" size={14} />;
}
