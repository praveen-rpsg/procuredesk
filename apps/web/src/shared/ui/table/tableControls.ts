import { Children, isValidElement, useMemo, type ReactNode } from "react";

export type TableSortDirection = "asc" | "desc";

export type TableSortState = {
  direction: TableSortDirection;
  key: string;
} | null;

export type TableColumnControls<TRow> = {
  enableFilter?: boolean;
  enableSort?: boolean;
  filterOptions?: TableFilterOption[];
  filterValue?: (row: TRow) => ReactNode;
  header: ReactNode;
  key: string;
  render: (row: TRow) => ReactNode;
  sortValue?: (row: TRow) => ReactNode;
};

export type TableFilterOption = {
  label: string;
  value: string;
};

export function useProcessedTableRows<TRow>(
  rows: TRow[],
  columns: Array<TableColumnControls<TRow>>,
  filters: Record<string, string>,
  sortState: TableSortState,
): TRow[] {
  return useMemo(() => {
    const activeFilters = Object.entries(filters)
      .map(([key, value]) => [key, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value.length > 0);
    const columnByKey = new Map(columns.map((column) => [column.key, column]));

    const filteredRows = activeFilters.length
      ? rows.filter((row) =>
          activeFilters.every(([key, value]) => {
            const column = columnByKey.get(key);
            if (!column) return true;
            const columnText = getColumnText(row, column).trim().toLowerCase();
            return column.filterOptions ? columnText === value : columnText.includes(value);
          }),
        )
      : rows;

    if (!sortState) return filteredRows;
    const sortColumn = columnByKey.get(sortState.key);
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const comparison = compareValues(getSortValue(left, sortColumn), getSortValue(right, sortColumn));
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, filters, rows, sortState]);
}

export function canFilterColumn<TRow>(column: TableColumnControls<TRow>): boolean {
  return column.enableFilter ?? isDataColumn(column);
}

export function canSortColumn<TRow>(column: TableColumnControls<TRow>): boolean {
  return column.enableSort ?? isDataColumn(column);
}

export function nextSortState(key: string, current: TableSortState): TableSortState {
  if (current?.key !== key) return { direction: "asc", key };
  if (current.direction === "asc") return { direction: "desc", key };
  return null;
}

function isDataColumn<TRow>(column: TableColumnControls<TRow>): boolean {
  return Boolean(textFromNode(column.header).trim()) && !["actions", "select"].includes(column.key);
}

function getColumnText<TRow>(row: TRow, column: TableColumnControls<TRow>): string {
  return textFromNode(column.filterValue ? column.filterValue(row) : column.render(row));
}

function getSortValue<TRow>(row: TRow, column: TableColumnControls<TRow>): string | number {
  const rawValue = column.sortValue ? column.sortValue(row) : column.filterValue ? column.filterValue(row) : column.render(row);
  const textValue = textFromNode(rawValue).trim();
  const numericValue = Number(textValue.replace(/[,%₹$]/g, ""));
  if (textValue && Number.isFinite(numericValue)) return numericValue;
  return textValue.toLowerCase();
}

function compareValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function textFromNode(value: ReactNode): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).join(" ");
  if (isValidElement<{ children?: ReactNode }>(value)) return textFromNode(value.props.children);
  return Children.toArray(value).map(textFromNode).join(" ");
}
