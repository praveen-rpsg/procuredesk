import type { SelectHTMLAttributes } from "react";

import { useFormFieldContext } from "./FormField";

export type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  options: SelectOption[];
  placeholder?: string;
};

export function Select({ className = "", id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, options, placeholder, ...props }: SelectProps) {
  const ctx = useFormFieldContext();
  return (
    <select
      aria-describedby={ariaDescribedBy ?? ctx?.describedBy}
      aria-invalid={ariaInvalid ?? (ctx?.hasError ? "true" : undefined)}
      className={`text-input ${className}`.trim()}
      id={id ?? ctx?.inputId}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option disabled={option.disabled ?? false} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
