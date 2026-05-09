import type { InputHTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useId } from "react";

type FormFieldContextValue = {
  inputId: string;
  describedBy: string | undefined;
  hasError: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

type FormFieldProps = {
  children: ReactNode;
  error?: string | undefined;
  helperText?: string | undefined;
  label: string;
  required?: boolean;
};

export function FormField({ children, error, helperText, label, required }: FormFieldProps) {
  const baseId = useId();
  const helperId = helperText ? `${baseId}-helper` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FormFieldContext.Provider
      value={{ inputId: baseId, describedBy, hasError: Boolean(error) }}
    >
      <div className="form-field">
        <label htmlFor={baseId} className="form-field-label">
          {label}
          {required ? (
            <span className="form-field-required" aria-hidden="true">*</span>
          ) : null}
        </label>
        {children}
        {helperText ? (
          <small id={helperId}>{helperText}</small>
        ) : null}
        {error ? (
          <span className="form-field-error" id={errorId} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...props }: TextInputProps) {
  const ctx = useContext(FormFieldContext);
  return (
    <input
      className="text-input"
      id={id ?? ctx?.inputId}
      aria-describedby={ariaDescribedBy ?? ctx?.describedBy}
      aria-invalid={ariaInvalid ?? (ctx?.hasError ? "true" : undefined)}
      {...props}
    />
  );
}
