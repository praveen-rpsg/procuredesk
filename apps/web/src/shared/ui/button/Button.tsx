import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonSize = "sm" | "md" | "lg";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: ButtonSize;
    variant?: ButtonVariant;
    /** Render as an anchor tag (for navigation). Passes through href/target/rel. */
    href?: string;
  }
>;

const sizeClass: Record<ButtonSize, string> = {
  sm: "button-sm",
  md: "",
  lg: "button-lg",
};

const variantClass: Record<ButtonVariant, string> = {
  primary:   "",
  secondary: "button-secondary",
  ghost:     "button-ghost",
  danger:    "button-danger",
};

export function Button({
  children,
  className = "",
  size = "md",
  variant = "primary",
  href,
  ...props
}: ButtonProps) {
  const classes = [
    "button",
    variantClass[variant],
    sizeClass[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    const anchorProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    return (
      <a
        className={classes}
        href={href}
        rel={isExternal ? "noopener noreferrer" : undefined}
        target={isExternal ? "_blank" : undefined}
        {...anchorProps}
      >
        {children}
      </a>
    );
  }

  return (
    <button className={classes} type="button" {...props}>
      {children}
    </button>
  );
}
