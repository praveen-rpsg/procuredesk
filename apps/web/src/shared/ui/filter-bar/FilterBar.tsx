import type { PropsWithChildren, ReactNode } from "react";

type FilterBarProps = PropsWithChildren<{
  actions?: ReactNode;
}>;

export function FilterBar({ actions, children }: FilterBarProps) {
  return (
    <section className="state-panel filter-bar">
      <div className="filter-bar-controls">{children}</div>
      {actions ? <div className="filter-bar-actions">{actions}</div> : null}
    </section>
  );
}
