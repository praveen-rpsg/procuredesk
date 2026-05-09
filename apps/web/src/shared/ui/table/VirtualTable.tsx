import type { ReactNode, UIEvent } from "react";
import { useMemo, useState } from "react";

export type VirtualTableColumn<TRow> = {
  key: string;
  header: string;
  render: (row: TRow) => ReactNode;
};

type VirtualTableProps<TRow> = {
  ariaLabel?: string;
  columns: VirtualTableColumn<TRow>[];
  emptyMessage?: string;
  getRowKey: (row: TRow) => string;
  maxHeight?: number;
  rowHeight?: number;
  rows: TRow[];
};

export function VirtualTable<TRow>({
  ariaLabel = "Virtualized data table",
  columns,
  emptyMessage = "No records found.",
  getRowKey,
  maxHeight = 520,
  rowHeight = 48,
  rows,
}: VirtualTableProps<TRow>) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 6;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(maxHeight / rowHeight) + overscan * 2;
  const visibleEnd = Math.min(rows.length, visibleStart + visibleCount);
  const visibleRows = useMemo(() => rows.slice(visibleStart, visibleEnd), [rows, visibleEnd, visibleStart]);
  const topSpacerHeight = visibleStart * rowHeight;
  const bottomSpacerHeight = Math.max(0, (rows.length - visibleEnd) * rowHeight);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
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
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
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
                <tr key={getRowKey(row)} style={{ height: rowHeight }}>
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
