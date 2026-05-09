import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../../shared/auth/AuthProvider";
import { Button } from "../../shared/ui/button/Button";
import { FormField, TextInput } from "../../shared/ui/form/FormField";

export function LoginPage() {
  const { login } = useAuth();
  const [tenantCode, setTenantCode] = useState("");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const safeRedirectPath = readSafeLoginRedirect();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({
        tenantCode: tenantCode.trim() || undefined,
        usernameOrEmail,
        password,
      });
      if (safeRedirectPath) {
        window.history.replaceState(null, "", safeRedirectPath);
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand brand-login">
          <div className="brand-mark">PD</div>
          <div>
            <div className="brand-title">ProcureDesk</div>
            <div className="brand-subtitle">Procurement Workstation</div>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Secure access</p>
          <h1>Sign in to continue</h1>
          <p>
            Use your tenant code for tenant access. Platform administrators can
            sign in without a tenant code.
          </p>
        </div>

        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <FormField label="Tenant code">
            <TextInput
              autoComplete="organization"
              onChange={(event) => setTenantCode(event.target.value)}
              placeholder="RPSG"
              value={tenantCode}
            />
          </FormField>

          <FormField label="Username or email">
            <TextInput
              autoComplete="username"
              onChange={(event) => setUsernameOrEmail(event.target.value)}
              required
              value={usernameOrEmail}
            />
          </FormField>

          <FormField label="Password">
            <TextInput
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </FormField>

          {error ? <div className="form-error">{error}</div> : null}

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function readSafeLoginRedirect(): string | null {
  const params = new URLSearchParams(window.location.search);
  return safeLocalRedirect(params.get("redirectTo") ?? params.get("returnTo") ?? params.get("next"));
}

function safeLocalRedirect(value: string | null): string | null {
  if (!value || value.startsWith("//")) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
