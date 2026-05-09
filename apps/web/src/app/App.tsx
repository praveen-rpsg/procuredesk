import { AuthenticatedShell } from "./layouts/AuthenticatedShell";
import { LoginPage } from "../features/auth/LoginPage";
import { useAuth } from "../shared/auth/AuthProvider";
import { AppErrorBoundary } from "../shared/ui/error-boundary/AppErrorBoundary";

export function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <main className="loading-screen">Loading ProcureDesk...</main>;
  }

  return <AppErrorBoundary>{user ? <AuthenticatedShell /> : <LoginPage />}</AppErrorBoundary>;
}
