export type EmailMessage = {
  htmlBody?: string;
  subject: string;
  textBody: string;
  to: string;
};

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ providerMessageId?: string | null }>;
}
