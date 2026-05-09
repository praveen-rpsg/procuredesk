import type { PropsWithChildren } from "react";

type TooltipProps = PropsWithChildren<{
  label: string;
}>;

export function Tooltip({ children, label }: TooltipProps) {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip-content" role="tooltip">
        {label}
      </span>
    </span>
  );
}
