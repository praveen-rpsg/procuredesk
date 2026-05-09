import type { InputHTMLAttributes } from "react";

type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function DatePicker({ className = "", ...props }: DatePickerProps) {
  return <input className={`text-input ${className}`.trim()} type="date" {...props} />;
}
