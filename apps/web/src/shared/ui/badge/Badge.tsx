import type { PropsWithChildren, ReactNode } from "react";

export type BadgeTone = "danger" | "info" | "neutral" | "success" | "warning";

type BadgeProps = PropsWithChildren<{
  icon?: ReactNode;
  tone?: BadgeTone;
}>;

export function Badge({ children, icon, tone = "neutral" }: BadgeProps) {
  return (
    <span className={`status-badge status-badge-${tone}`}>
      {icon ? <span aria-hidden="true" className="status-badge-icon">{icon}</span> : null}
      {children}
    </span>
  );
}
