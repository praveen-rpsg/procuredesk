import type { ReactNode } from "react";

export type ActivityFeedItem = {
  id: string;
  meta?: ReactNode;
  summary: ReactNode;
  tone?: "danger" | "neutral" | "success" | "warning";
};

type ActivityFeedProps = {
  emptyMessage?: string;
  items: ActivityFeedItem[];
};

export function ActivityFeed({ emptyMessage = "No activity yet.", items }: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="hero-copy">{emptyMessage}</p>;
  }

  return (
    <ol className="activity-feed">
      {items.map((item) => (
        <li className={`activity-feed-item activity-feed-item-${item.tone ?? "neutral"}`} key={item.id}>
          <span aria-hidden="true" />
          <div>
            <strong>{item.summary}</strong>
            {item.meta ? <small>{item.meta}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
