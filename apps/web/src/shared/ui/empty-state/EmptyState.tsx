import type { PropsWithChildren, ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = PropsWithChildren<{
  action?: ReactNode;
  icon?: ReactNode;
  title: string;
}>;

export function EmptyState({ action, children, icon, title }: EmptyStateProps) {
  return (
    <section className="state-panel empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon ?? <Inbox size={22} />}
      </span>
      <div className="empty-state-copy">
        <h2>{title}</h2>
        {children ? (
          <p>{children}</p>
        ) : null}
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
