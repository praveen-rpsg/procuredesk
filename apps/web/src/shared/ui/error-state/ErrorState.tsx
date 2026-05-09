import { AlertCircle } from "lucide-react";

type ErrorStateProps = {
  message: string;
  title?: string;
};

export function ErrorState({ message, title = "Something went wrong" }: ErrorStateProps) {
  return (
    <section
      className="state-panel state-panel-error error-state"
      role="alert"
    >
      <AlertCircle
        size={20}
        className="error-state-icon"
        aria-hidden="true"
      />
      <div className="error-state-copy">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}
