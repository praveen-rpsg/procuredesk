import type { PropsWithChildren } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Info } from "lucide-react";

import { Badge, type BadgeTone } from "../badge/Badge";

type StatusBadgeProps = PropsWithChildren<{
  tone?: BadgeTone;
}>;

const toneIcon: Record<BadgeTone, React.FC<{ size: number }>> = {
  success: CheckCircle,
  warning: AlertTriangle,
  danger:  AlertCircle,
  neutral: Clock,
  info:    Info,
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  const Icon = toneIcon[tone];
  return (
    <Badge tone={tone} icon={<Icon size={11} />}>
      {children}
    </Badge>
  );
}
