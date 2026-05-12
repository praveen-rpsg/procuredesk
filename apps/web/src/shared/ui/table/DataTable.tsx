import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from "lucide-react";

import { Skeleton } from "../skeleton/Skeleton";
import {
  canFilterColumn,
  canSortColumn,
  nextSortState,
  useProcessedTableRows,
  type TableFilterOption,
  type TableSortDirection,
  type TableSortState,
} from "./tableControls";

export type DataTableColumn<TRow> = {
  enableFilter?: boolean;
  enableSort?: boolean;
  filterOptions?: TableFilterOption[];
  filterValue?: (row: TRow) => ReactNode;
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
  /** Set to "asc" | "desc" for sortable columns; omit if not sortable */
  sortDirection?: TableSortDirection | undefined;
  sortValue?: (row: TRow) => ReactNode;
  onSort?: () => void;
};

type DataTableProps<TRow> = {
  ariaLabel?: string;
  columns: DataTableColumn<TRow>[];
  emptyMessage?: string;
  getRowKey: (row: TRow) => string;
  isLoading?: boolean;
  onRowClick?: (row: TRow) => void;
  rows: TRow[];
  /** Number of skeleton rows to show while loading */
  skeletonRows?: number;
};

const SKELETON_COUNT_DEFAULT = 5;

export function DataTable<TRow>({
  ariaLabel = "Data table",
  columns,
  emptyMessage = "No records found.",
  getRowKey,
  isLoading = false,
  onRowClick,
  rows,
  skeletonRows = SKELETON_COUNT_DEFAULT,
}: DataTableProps<TRow>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);
  const [sortState, setSortState] = useState<TableSortState>(null);
  const processedRows = useProcessedTableRows(rows, columns, filters, sortState);

  const setColumnFilter = (key: string, value: string) => {
    setFilters((current) => {
      const next = { ...current };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  return (
    <div aria-label={ariaLabel} className="table-shell" role="region" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  column.sortDirection === "asc"
                    ? "ascending"
                    : column.sortDirection === "desc"
                    ? "descending"
                    : column.onSort
                    ? "none"
                    : undefined
                }
              >
                <TableHeader
                  canFilter={canFilterColumn(column)}
                  canSort={Boolean(column.onSort) || canSortColumn(column)}
                  filterOptions={column.filterOptions}
                  filterValue={filters[column.key] ?? ""}
                  header={column.header}
                  isFilterOpen={filterColumnKey === column.key}
                  onClearFilter={() => setColumnFilter(column.key, "")}
                  onFilterChange={(value) => setColumnFilter(column.key, value)}
                  onSort={() => (column.onSort ? column.onSort() : setSortState((current) => nextSortState(column.key, current)))}
                  onToggleFilter={() => setFilterColumnKey((current) => (current === column.key ? null : column.key))}
                  sortDirection={column.sortDirection ?? (sortState?.key === column.key ? sortState.direction : undefined)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={i} aria-hidden="true">
                {columns.map((column) => (
                  <td key={column.key}>
                    <Skeleton height={14} width={`${60 + ((i * 13 + column.key.length * 7) % 35)}%`} />
                  </td>
                ))}
              </tr>
            ))
          ) : processedRows.length === 0 ? (
            <tr>
              <td className="table-empty-cell" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            processedRows.map((row) => (
              <tr
                className={onRowClick ? "table-row-clickable" : undefined}
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
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
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
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
  header: string;
  isFilterOpen: boolean;
  onClearFilter: () => void;
  onFilterChange: (value: string) => void;
  onSort: () => void;
  onToggleFilter: () => void;
  sortDirection?: TableSortDirection | undefined;
}) {
  const hasActiveFilter = Boolean(filterValue.trim());
  const hasActiveSort = Boolean(sortDirection);
  const isFilterHighlighted = hasActiveFilter || isFilterOpen;

  if (!canFilter && !canSort) return <span>{header}</span>;
  return (
    <div className="table-header-control">
      <button
        aria-label={canSort ? `Sort by ${header}` : undefined}
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
          aria-label={`Filter ${header}`}
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
              aria-label={`Filter ${header}`}
              onChange={(event) => onFilterChange(event.target.value)}
              value={filterValue}
            >
              <option value="">All {header}</option>
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
              placeholder={`Filter ${header}`}
              value={filterValue}
            />
          )}
          <button aria-label={`Clear ${header} filter`} onClick={onClearFilter} type="button">
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SortIcon({ direction }: { direction?: TableSortDirection | undefined }) {
  if (direction === "asc") return <ArrowUp aria-hidden="true" size={14} />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" size={14} />;
  return <ChevronsUpDown aria-hidden="true" size={14} />;
}
