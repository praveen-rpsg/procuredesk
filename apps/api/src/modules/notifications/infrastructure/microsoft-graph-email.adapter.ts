import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvConfig } from "../../../config/env.schema.js";
import type { EmailAdapter, EmailMessage } from "../domain/email-adapter.js";

@Injectable()
export class MicrosoftGraphEmailAdapter implements EmailAdapter {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async send(message: EmailMessage): Promise<{ providerMessageId?: string | null }> {
    const graph = this.graphConfig();
    const token = await this.getAccessToken(graph);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graph.senderMailbox)}/sendMail`,
      {
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: {
              contentType: message.htmlBody ? "HTML" : "Text",
              content: message.htmlBody ?? message.textBody,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: message.to,
                },
              },
            ],
          },
          saveToSentItems: false,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Microsoft Graph sendMail failed with ${response.status}: ${body}`);
    }

    return {};
  }

  assertConfigured(): void {
    this.graphConfig();
  }

  isConfigured(): boolean {
    try {
      this.graphConfig();
      return true;
    } catch {
      return false;
    }
  }

  private graphConfig(): {
    clientId: string;
    clientSecret: string;
    senderMailbox: string;
    tenantId: string;
  } {
    const required = [
      "MS_GRAPH_TENANT_ID",
      "MS_GRAPH_CLIENT_ID",
      "MS_GRAPH_CLIENT_SECRET",
      "MS_GRAPH_SENDER_MAILBOX",
    ] as const;
    const missing = required.filter((key) => !this.config.get(key, { infer: true }));
    if (missing.length) {
      throw new Error(`Missing Microsoft Graph configuration: ${missing.join(", ")}`);
    }
    return {
      clientId: this.config.get("MS_GRAPH_CLIENT_ID", { infer: true }) as string,
      clientSecret: this.config.get("MS_GRAPH_CLIENT_SECRET", { infer: true }) as string,
      senderMailbox: this.config.get("MS_GRAPH_SENDER_MAILBOX", { infer: true }) as string,
      tenantId: this.config.get("MS_GRAPH_TENANT_ID", { infer: true }) as string,
    };
  }

  private async getAccessToken(graph: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  }): Promise<string> {
    const body = new URLSearchParams({
      client_id: graph.clientId,
      client_secret: graph.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(graph.tenantId)}/oauth2/v2.0/token`,
      {
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { access_token?: string; error_description?: string }
      | null;

    if (!response.ok || !payload?.access_token) {
      throw new Error(
        `Microsoft Graph token request failed with ${response.status}: ${
          payload?.error_description ?? "No access token returned"
        }`,
      );
    }

    return payload.access_token;
  }
}
