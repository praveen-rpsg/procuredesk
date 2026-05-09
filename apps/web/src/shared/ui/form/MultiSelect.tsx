import type { SelectHTMLAttributes } from "react";

import type { SelectOption } from "./Select";

type MultiSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "multiple"> & {
  options: SelectOption[];
};

export function MultiSelect({ className = "", options, ...props }: MultiSelectProps) {
  return (
    <select className={`text-input multi-select ${className}`.trim()} multiple {...props}>
      {options.map((option) => (
        <option disabled={option.disabled ?? false} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
