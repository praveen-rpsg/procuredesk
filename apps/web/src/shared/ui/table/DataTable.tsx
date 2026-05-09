import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Skeleton } from "../skeleton/Skeleton";

export type DataTableColumn<TRow> = {
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
  /** Set to "asc" | "desc" for sortable columns; omit if not sortable */
  sortDirection?: "asc" | "desc" | undefined;
  onSort?: () => void;
};

type DataTableProps<TRow> = {
  ariaLabel?: string;
  columns: DataTableColumn<TRow>[];
  emptyMessage?: string;
  getRowKey: (row: TRow) => string;
  isLoading?: boolean;
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
  rows,
  skeletonRows = SKELETON_COUNT_DEFAULT,
}: DataTableProps<TRow>) {
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
                {column.onSort ? (
                  <button
                    aria-label={`Sort by ${column.header}`}
                    className="table-sort-button"
                    onClick={column.onSort}
                    type="button"
                  >
                    <span>{column.header}</span>
                    <SortIcon direction={column.sortDirection} />
                  </button>
                ) : (
                  column.header
                )}
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
          ) : rows.length === 0 ? (
            <tr>
              <td className="table-empty-cell" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
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

function SortIcon({ direction }: { direction?: "asc" | "desc" | undefined }) {
  if (direction === "asc") return <ArrowUp aria-hidden="true" size={14} />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" size={14} />;
  return <ChevronsUpDown aria-hidden="true" size={14} />;
}
