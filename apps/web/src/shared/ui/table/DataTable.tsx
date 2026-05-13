import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Filter, X } from "lucide-react";

import { Button } from "../button/Button";
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
  header: ReactNode;
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
  pagination?: boolean | TablePaginationConfig;
  rows: TRow[];
  /** Number of skeleton rows to show while loading */
  skeletonRows?: number;
};

const SKELETON_COUNT_DEFAULT = 5;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type TablePaginationConfig = {
  pageSize?: number;
  pageSizeOptions?: number[];
};

export function DataTable<TRow>({
  ariaLabel = "Data table",
  columns,
  emptyMessage = "No records found.",
  getRowKey,
  isLoading = false,
  onRowClick,
  pagination = true,
  rows,
  skeletonRows = SKELETON_COUNT_DEFAULT,
}: DataTableProps<TRow>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);
  const [sortState, setSortState] = useState<TableSortState>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(() => getPaginationConfig(pagination)?.pageSize ?? DEFAULT_PAGE_SIZE);
  const processedRows = useProcessedTableRows(rows, columns, filters, sortState);
  const paginationConfig = getPaginationConfig(pagination);
  const pageSizeOptions = paginationConfig?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const isPaginationVisible = Boolean(paginationConfig) && processedRows.length > pageSize;
  const pagedRows = useMemo(() => {
    if (!paginationConfig) return processedRows;
    const start = pageIndex * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [pageIndex, pageSize, paginationConfig, processedRows]);

  useEffect(() => {
    const nextPageSize = paginationConfig?.pageSize ?? DEFAULT_PAGE_SIZE;
    setPageSize((current) => (current === nextPageSize ? current : nextPageSize));
  }, [paginationConfig?.pageSize]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    setPageIndex(0);
  }, [filters, rows, sortState]);

  const setColumnFilter = (key: string, value: string) => {
    setFilters((current) => {
      const next = { ...current };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  return (
    <div className="table-frame">
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
              pagedRows.map((row) => (
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
      {!isLoading && isPaginationVisible ? (
        <TablePagination
          pageIndex={pageIndex}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          totalRows={processedRows.length}
          onPageChange={setPageIndex}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPageIndex(0);
          }}
        />
      ) : null}
    </div>
  );
}

function getPaginationConfig(pagination: DataTableProps<unknown>["pagination"]): Required<TablePaginationConfig> | null {
  if (pagination === false) return null;
  if (pagination === true || pagination === undefined) {
    return {
      pageSize: DEFAULT_PAGE_SIZE,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
    };
  }
  return {
    pageSize: pagination.pageSize ?? DEFAULT_PAGE_SIZE,
    pageSizeOptions: pagination.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS,
  };
}

function TablePagination({
  onPageChange,
  onPageSizeChange,
  pageIndex,
  pageSize,
  pageSizeOptions,
  totalRows,
}: {
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageIndex: number;
  pageSize: number;
  pageSizeOptions: number[];
  totalRows: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(totalRows, (pageIndex + 1) * pageSize);

  return (
    <div className="pagination-bar table-pagination-bar">
      <span className="pagination-info">
        Showing {rangeStart} - {rangeEnd} of {totalRows}
      </span>
      <label className="pagination-size-control">
        Rows
        <select
          aria-label="Rows per page"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <Button
        aria-label="Previous page"
        disabled={pageIndex === 0}
        onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
        size="sm"
        variant="secondary"
      >
        <ChevronLeft aria-hidden="true" size={15} />
        Previous
      </Button>
      <span className="pagination-page-pill">Page {pageIndex + 1} of {totalPages}</span>
      <Button
        aria-label="Next page"
        disabled={pageIndex >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, pageIndex + 1))}
        size="sm"
        variant="secondary"
      >
        Next
        <ChevronRight aria-hidden="true" size={15} />
      </Button>
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

  if (!canFilter && !canSort) return <span title={headerLabel}>{header}</span>;
  return (
    <div className="table-header-control" title={headerLabel}>
      <button
        aria-label={canSort ? `Sort by ${headerLabel}` : undefined}
        aria-pressed={canSort ? hasActiveSort : undefined}
        className={`table-sort-button ${hasActiveSort ? "table-sort-button-active" : ""}`.trim()}
        disabled={!canSort}
        onClick={canSort ? onSort : undefined}
        type="button"
      >
        <span title={headerLabel}>{header}</span>
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
