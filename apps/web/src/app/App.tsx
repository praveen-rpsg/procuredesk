import { AuthenticatedShell } from "./layouts/AuthenticatedShell";
import { LoginPage, ResetPasswordPage } from "../features/auth/LoginPage";
import { useAuth } from "../shared/auth/AuthProvider";
import { AppErrorBoundary } from "../shared/ui/error-boundary/AppErrorBoundary";

export function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <main className="loading-screen">Loading ProcureDesk...</main>;
  }

  return (
    <AppErrorBoundary>
      {user ? <AuthenticatedShell /> : window.location.pathname === "/reset-password" ? <ResetPasswordPage /> : <LoginPage />}
    </AppErrorBoundary>
  );
}
