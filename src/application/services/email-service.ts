import { getEmailTransport, type EmailTransport, type EmailMessage } from "@/infrastructure/email/transport";
import * as templates from "@/infrastructure/email/templates";
import { logger } from "@/infrastructure/logging/logger";

interface UserLike {
  email: string;
  name: string;
  notificationPrefs?: unknown;
}

type EventKey =
  | "INVITE"
  | "APPLICATION_DECISION"
  | "SHIFT_REMINDER"
  | "TIMEOFF_DECISION";

/**
 * Centralised wrapper around the email transport. Adds:
 *  - notification-preference gating per user
 *  - structured logging
 *  - graceful fallback so a missing transport never blocks a request
 */
export class EmailService {
  constructor(
    private readonly transport: EmailTransport = getEmailTransport(),
  ) {}

  async sendInvite(
    user: { email: string; name: string },
    args: Parameters<typeof templates.inviteEmail>[0],
  ): Promise<void> {
    await this.send(user, "INVITE", { ...templates.inviteEmail(args), to: user.email });
  }

  async sendApplicationDecision(
    user: UserLike,
    args: Parameters<typeof templates.applicationDecisionEmail>[0],
  ): Promise<void> {
    await this.send(user, "APPLICATION_DECISION", {
      ...templates.applicationDecisionEmail(args),
      to: user.email,
    });
  }

  async sendShiftReminder(
    user: UserLike,
    args: Parameters<typeof templates.shiftReminderEmail>[0],
  ): Promise<void> {
    await this.send(user, "SHIFT_REMINDER", {
      ...templates.shiftReminderEmail(args),
      to: user.email,
    });
  }

  async sendTimeOffDecision(
    user: UserLike,
    args: Parameters<typeof templates.timeOffDecisionEmail>[0],
  ): Promise<void> {
    await this.send(user, "TIMEOFF_DECISION", {
      ...templates.timeOffDecisionEmail(args),
      to: user.email,
    });
  }

  private async send(
    user: UserLike,
    event: EventKey,
    message: EmailMessage,
  ): Promise<void> {
    if (!isOptedIn(user.notificationPrefs, event)) {
      return;
    }
    try {
      await this.transport.send(message);
    } catch (error) {
      logger.error({
        event: "email.send.failed",
        emailEvent: event,
        to: user.email,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}

/**
 * Reads `User.notificationPrefs` JSON of shape `{ email: { INVITE: true, ... } }`.
 * Defaults to enabled when a key is unset so first-time users still get critical mail.
 */
export function isOptedIn(prefs: unknown, event: EventKey): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const obj = prefs as { email?: Record<string, boolean | undefined> };
  if (!obj.email) return true;
  const value = obj.email[event];
  return value !== false;
}
