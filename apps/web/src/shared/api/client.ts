const defaultApiBaseUrl = "http://localhost:3100/api/v1";

export const apiBaseUrl = readApiBaseUrl(import.meta.env as unknown);

export class ApiError extends Error {
  payload: unknown;
  status: number;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
  }
}

export async function apiRequest<TResponse>(
  path: string,
  options: RequestInit = {},
): Promise<TResponse> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCookie("procuredesk_csrf");
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch((): null => null);
    const message = problemDetailMessage(payload);
    throw new ApiError(message, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  if (!text) {
    return undefined as TResponse;
  }

  return JSON.parse(text) as TResponse;
}

function readApiBaseUrl(env: unknown): string {
  if (!env || typeof env !== "object") return defaultApiBaseUrl;
  const value = (env as Record<string, unknown>).VITE_API_URL;
  return typeof value === "string" && value ? value : defaultApiBaseUrl;
}

function problemDetailMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Request failed.";
  const detail = (payload as Record<string, unknown>).detail;
  return typeof detail === "string" ? detail : "Request failed.";
}

function readCookie(name: string): string | null {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = cookie.slice(0, separatorIndex);
    if (decodeURIComponent(key) === name) {
      return decodeURIComponent(cookie.slice(separatorIndex + 1));
    }
  }
  return null;
}
