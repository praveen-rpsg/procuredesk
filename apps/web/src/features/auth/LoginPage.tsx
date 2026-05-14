import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../../shared/auth/AuthProvider";
import { apiRequest } from "../../shared/api/client";
import { Button } from "../../shared/ui/button/Button";
import { FormField, TextInput } from "../../shared/ui/form/FormField";

export function LoginPage() {
  const { login } = useAuth();
  const [tenantCode, setTenantCode] = useState("");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [isForgotMode, setIsForgotMode] = useState(false);
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

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setForgotMessage(null);
    setIsSubmitting(true);
    try {
      await apiRequest<{ ok: true }>("/auth/forgot-password", {
        body: JSON.stringify({
          email: usernameOrEmail,
          tenantCode: tenantCode.trim() || undefined,
        }),
        method: "POST",
      });
      setForgotMessage("If an account exists, a reset link has been emailed.");
    } catch (forgotError) {
      setError(forgotError instanceof Error ? forgotError.message : "Unable to request reset link.");
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

        <form className="login-form" onSubmit={(event) => void (isForgotMode ? handleForgotPassword(event) : handleSubmit(event))}>
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

          {isForgotMode ? null : (
            <FormField label="Password">
              <TextInput
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </FormField>
          )}

          {error ? <div className="form-error">{error}</div> : null}
          {forgotMessage ? <div className="form-success">{forgotMessage}</div> : null}

          <Button disabled={isSubmitting} type="submit">
            {isForgotMode
              ? isSubmitting
                ? "Sending..."
                : "Send reset link"
              : isSubmitting
                ? "Signing in..."
                : "Sign in"}
          </Button>
          <Button
            onClick={() => {
              setError(null);
              setForgotMessage(null);
              setIsForgotMode((value) => !value);
            }}
            type="button"
            variant="secondary"
          >
            {isForgotMode ? "Back to sign in" : "Forgot password"}
          </Button>
        </form>
      </section>
    </main>
  );
}

export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest<{ updated: true }>("/auth/reset-password", {
        body: JSON.stringify({ newPassword, token }),
        method: "POST",
      });
      setMessage("Password updated. You can sign in now.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset password.");
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
            <div className="brand-subtitle">Password Reset</div>
          </div>
        </div>
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <FormField label="New password">
            <TextInput
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </FormField>
          <FormField label="Confirm password">
            <TextInput
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </FormField>
          {error ? <div className="form-error">{error}</div> : null}
          {message ? <div className="form-success">{message}</div> : null}
          <Button disabled={isSubmitting || !token} type="submit">
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
          <Button onClick={() => window.history.replaceState(null, "", "/")} type="button" variant="secondary">
            Back to sign in
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
