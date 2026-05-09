import type { PropsWithChildren, ReactNode } from "react";

import { Drawer } from "../drawer/Drawer";

type FilterDrawerProps = PropsWithChildren<{
  actions?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}>;

export function FilterDrawer({
  actions,
  children,
  isOpen,
  onClose,
  title = "Filters",
}: FilterDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title}>
      <div className="filter-drawer-content">{children}</div>
      {actions ? <div className="filter-drawer-actions">{actions}</div> : null}
    </Drawer>
  );
}
