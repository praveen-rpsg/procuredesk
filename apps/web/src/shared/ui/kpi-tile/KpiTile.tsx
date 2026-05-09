import type { ReactNode } from "react";

type KpiTileProps = {
  icon?: ReactNode;
  label: string;
  subLabel?: string;
  tone?: "danger" | "success" | "warning";
  value: ReactNode;
};

export function KpiTile({ icon, label, subLabel, tone, value }: KpiTileProps) {
  return (
    <article className={`metric-card${tone ? ` metric-card-${tone}` : ""}`}>
      {icon ? (
        <div className="metric-card-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <span>{label}</span>
      <strong>{value}</strong>
      {subLabel ? (
        <small className="metric-card-sub-label">{subLabel}</small>
      ) : null}
    </article>
  );
}
