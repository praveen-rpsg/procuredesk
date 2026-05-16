import type { TextareaHTMLAttributes } from "react";

import { useFormFieldContext } from "./FormField";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className = "", id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...props }: TextAreaProps) {
  const ctx = useFormFieldContext();
  return (
    <textarea
      aria-describedby={ariaDescribedBy ?? ctx?.describedBy}
      aria-invalid={ariaInvalid ?? (ctx?.hasError ? "true" : undefined)}
      className={`text-input text-area ${className}`.trim()}
      id={id ?? ctx?.inputId}
      {...props}
    />
  );
}
