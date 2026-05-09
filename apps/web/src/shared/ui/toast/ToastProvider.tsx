import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";

type ToastTone = "success" | "warning" | "danger" | "neutral";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  notify: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ToastIcon: Record<ToastTone, React.FC<{ size: number }>> = {
  success: CheckCircle,
  warning: AlertTriangle,
  danger:  AlertCircle,
  neutral: Info,
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon = ToastIcon[toast.tone];
          return (
            <div
              className={`toast toast-${toast.tone}`}
              key={toast.id}
              role="status"
            >
              <span style={{ flexShrink: 0, marginTop: 1, display: "inline-flex" }}>
                <Icon size={16} />
              </span>
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                aria-label="Dismiss notification"
                className="toast-dismiss"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
