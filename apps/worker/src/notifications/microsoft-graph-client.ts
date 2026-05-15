export type MicrosoftGraphConfig = {
  clientId: string;
  clientSecret: string;
  senderMailbox: string;
  tenantId: string;
};

export type WorkerEmailMessage = {
  htmlBody?: string | null;
  subject: string;
  textBody: string;
  to: string;
};

const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 10_000;

export class MicrosoftGraphClient {
  constructor(private readonly config: MicrosoftGraphConfig) {}

  async send(message: WorkerEmailMessage): Promise<void> {
    const token = await this.getAccessToken();
    await this.fetchWithRetry(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderMailbox)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: {
              contentType: message.htmlBody ? "HTML" : "Text",
              content: message.htmlBody ?? message.textBody,
            },
            toRecipients: [{ emailAddress: { address: message.to } }],
          },
          saveToSentItems: false,
        }),
      },
      "sendMail",
    );
  }

  private async getAccessToken(): Promise<string> {
    const response = await this.fetchWithRetry(
      `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      },
      "getAccessToken",
    );

    const payload = (await response.json().catch(() => null)) as
      | { access_token?: string; error_description?: string }
      | null;

    if (!payload?.access_token) {
      throw new Error(
        `Microsoft Graph token request failed: ${payload?.error_description ?? "No access token returned"}`,
      );
    }

    return payload.access_token;
  }

  private async fetchWithRetry(url: string, init: RequestInit, operationName: string): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfterSec = Number(response.headers.get("Retry-After") ?? 5);
          await sleep(retryAfterSec * 1000);
          continue;
        }

        if (response.ok) return response;

        const body = await response.text().catch(() => "(unreadable body)");
        throw new Error(`Graph ${operationName} [${response.status}]: ${body.slice(0, 300)}`);
      } catch (err) {
        clearTimeout(timeout);
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) await sleep(1000 * 2 ** (attempt - 1));
      }
    }

    throw lastError ?? new Error(`Graph ${operationName} failed after ${MAX_RETRIES} attempts`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
