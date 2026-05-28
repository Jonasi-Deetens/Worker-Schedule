import { logger } from "@/infrastructure/logging/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Development/test transport that records sent emails in-memory. In tests you
 * can call `messages()` to assert on what was sent and `clear()` to reset.
 * In dev, emails are also logged so you can copy invite links from the console.
 */
export class InMemoryEmailTransport implements EmailTransport {
  private sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    if (process.env.NODE_ENV !== "test") {
      logger.info({
        event: "email.sent.dev",
        to: message.to,
        subject: message.subject,
      });
    }
  }

  messages(): ReadonlyArray<EmailMessage> {
    return this.sent;
  }

  clear() {
    this.sent = [];
  }
}

/**
 * Production Resend transport. Loaded lazily so apps without RESEND_API_KEY
 * don't need to install the SDK at runtime.
 */
class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend send failed (${response.status}): ${body}`);
    }
  }
}

let cached: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (cached) return cached;
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    cached = new ResendTransport(
      process.env.RESEND_API_KEY,
      process.env.EMAIL_FROM,
    );
  } else {
    cached = new InMemoryEmailTransport();
  }
  return cached;
}

export function __setEmailTransportForTests(transport: EmailTransport | null) {
  cached = transport;
}
