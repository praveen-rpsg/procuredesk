import { AuthenticatedShell } from "./layouts/AuthenticatedShell";
import { LoginPage, ResetPasswordPage } from "../features/auth/LoginPage";
import { useAuth } from "../shared/auth/AuthProvider";
import { AppErrorBoundary } from "../shared/ui/error-boundary/AppErrorBoundary";

export function App() {
  const { isLoading, user } = useAuth();
  const isResetPasswordRoute = window.location.pathname === "/reset-password";

  if (isLoading) {
    return <main className="loading-screen">Loading ProcureDesk...</main>;
  }

  return (
    <AppErrorBoundary>
      {isResetPasswordRoute ? <ResetPasswordPage /> : user ? <AuthenticatedShell /> : <LoginPage />}
    </AppErrorBoundary>
  );
}
