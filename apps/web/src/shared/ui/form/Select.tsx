import type { SelectHTMLAttributes } from "react";

export type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  options: SelectOption[];
  placeholder?: string;
};

export function Select({ className = "", options, placeholder, ...props }: SelectProps) {
  return (
    <select className={`text-input ${className}`.trim()} {...props}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option disabled={option.disabled ?? false} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
