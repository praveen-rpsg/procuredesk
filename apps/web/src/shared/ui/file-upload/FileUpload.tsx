import type { InputHTMLAttributes } from "react";

type FileUploadProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  helperText?: string;
  label: string;
};

export function FileUpload({ className = "", helperText, label, ...props }: FileUploadProps) {
  return (
    <label className={`file-upload ${className}`.trim()}>
      <span>{label}</span>
      <input type="file" {...props} />
      {helperText ? <small>{helperText}</small> : null}
    </label>
  );
}
