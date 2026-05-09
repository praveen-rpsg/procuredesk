import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  "aria-label": string;
  children: ReactNode;
  tooltip?: string;
  variant?: "danger" | "primary" | "secondary";
};

export function IconButton({
  children,
  className = "",
  tooltip,
  variant = "secondary",
  ...props
}: IconButtonProps) {
  const variantClassName =
    variant === "danger" ? "icon-button-danger" : variant === "primary" ? "icon-button-primary" : "";
  return (
    <button
      className={`icon-button ${variantClassName} ${className}`.trim()}
      title={tooltip ?? props["aria-label"]}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
