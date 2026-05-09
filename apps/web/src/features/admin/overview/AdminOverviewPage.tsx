import { useQuery } from "@tanstack/react-query";
import { Building2, ShieldCheck, Tags, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getCatalogSnapshot,
  listAdminEntities,
  listAdminUsers,
} from "../api/adminApi";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";

export type AdminOverviewItem = {
  description: string;
  group: string;
  icon: LucideIcon;
  key: string;
  label: string;
};

type AdminOverviewPageProps = {
  items: AdminOverviewItem[];
  onOpen: (key: string) => void;
};

export function AdminOverviewPage({ items }: AdminOverviewPageProps) {
  const canViewUsers = items.some((item) => item.key === "users");
  const canViewEntities = items.some((item) => item.key === "entities");
  const canViewCatalog = items.some((item) => item.key === "catalog" || item.key === "tender-rules");

  const users = useQuery({
    enabled: canViewUsers,
    queryFn: listAdminUsers,
    queryKey: ["admin-users"],
  });
  const entities = useQuery({
    enabled: canViewEntities,
    queryFn: listAdminEntities,
    queryKey: ["admin-entities"],
  });
  const catalog = useQuery({
    enabled: canViewCatalog,
    queryFn: getCatalogSnapshot,
    queryKey: ["catalog-snapshot"],
  });

  const activeUsers = users.data?.filter((user) => user.status === "active").length ?? 0;
  const pendingUsers = users.data?.filter((user) => user.status === "pending_password_setup").length ?? 0;
  const activeEntities = entities.data?.filter((entity) => entity.isActive).length ?? 0;
  const activeReferenceValues = catalog.data?.referenceValues.filter((value) => value.isActive).length ?? 0;
  const configuredTenderRules = catalog.data?.tenderTypes.filter((rule) => rule.completionDays !== null).length ?? 0;

  return (
    <section className="admin-section admin-grid-wide">
      <PageHeader eyebrow="Admin" title="Admin Overview">
        Check tenant setup health at a glance.
      </PageHeader>

      <section className="admin-overview-metric-grid" aria-label="Admin health summary">
        {canViewUsers ? (
          <MetricCard
            detail={pendingUsers ? `${pendingUsers} pending setup` : `${activeUsers} active`}
            icon={UsersRound}
            isLoading={users.isLoading}
            label="Users"
            value={users.data?.length ?? 0}
          />
        ) : null}
        {canViewEntities ? (
          <MetricCard
            detail={`${activeEntities} active`}
            icon={Building2}
            isLoading={entities.isLoading}
            label="Entities"
            value={entities.data?.length ?? 0}
          />
        ) : null}
        {canViewCatalog ? (
          <MetricCard
            detail={`${activeReferenceValues} active values`}
            icon={Tags}
            isLoading={catalog.isLoading}
            label="Choice Values"
            value={catalog.data?.referenceValues.length ?? 0}
          />
        ) : null}
        {canViewCatalog ? (
          <MetricCard
            detail="Completion rules configured"
            icon={ShieldCheck}
            isLoading={catalog.isLoading}
            label="Tender Rules"
            value={configuredTenderRules}
          />
        ) : null}
      </section>
    </section>
  );
}

type MetricCardProps = {
  detail: string;
  icon: LucideIcon;
  isLoading: boolean;
  label: string;
  value: number;
};

function MetricCard({ detail, icon: Icon, isLoading, label, value }: MetricCardProps) {
  return (
    <article className="admin-overview-metric">
      <span className="admin-overview-card-icon">
        <Icon size={18} />
      </span>
      <div>
        <p>{label}</p>
        {isLoading ? <Skeleton height={26} /> : <strong>{value}</strong>}
        <span>{detail}</span>
      </div>
    </article>
  );
}
