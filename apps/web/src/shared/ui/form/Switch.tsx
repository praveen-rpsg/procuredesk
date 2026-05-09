import type { InputHTMLAttributes, ReactNode } from "react";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Switch({ className = "", label, ...props }: SwitchProps) {
  return (
    <label className={`switch-control ${className}`.trim()}>
      <input type="checkbox" {...props} />
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </label>
  );
}
