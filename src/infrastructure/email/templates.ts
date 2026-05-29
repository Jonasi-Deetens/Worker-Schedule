import type { EmailMessage } from "./transport";

interface BaseTemplateInput {
  recipientName: string;
  businessName: string;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
    ${body}
    <hr style="margin-top:32px;border:none;border-top:1px solid #e2e8f0">
    <p style="color:#64748b;font-size:12px;margin-top:16px">Work Calendar</p>
  </div>
</body></html>`;
}

export interface InviteEmailInput extends BaseTemplateInput {
  inviteUrl: string;
  expiresAt: Date;
}

export function inviteEmail(input: InviteEmailInput): EmailMessage {
  const subject = `${input.businessName} invited you to Work Calendar`;
  const expiry = input.expiresAt.toLocaleDateString("en-GB");
  const html = shell(
    subject,
    `<h1 style="font-size:20px;color:#0f172a">You're invited to ${input.businessName}</h1>
     <p style="color:#334155">Hi ${input.recipientName}, accept your invite to start picking up shifts.</p>
     <p style="margin:24px 0">
       <a href="${input.inviteUrl}"
          style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
         Accept invite
       </a>
     </p>
     <p style="color:#64748b;font-size:13px">This link expires on ${expiry}.</p>`,
  );
  const text = `${input.businessName} invited you to Work Calendar.\nAccept here: ${input.inviteUrl}\nExpires ${expiry}.`;
  return { to: "", subject, html, text };
}

export interface PasswordResetEmailInput {
  recipientName: string;
  resetUrl: string;
  expiresAt: Date;
}

export function passwordResetEmail(input: PasswordResetEmailInput): EmailMessage {
  const subject = "Reset your Work Calendar password";
  const expiry = input.expiresAt.toLocaleString("en-GB");
  const html = shell(
    subject,
    `<h1 style="font-size:20px;color:#0f172a">Reset your password</h1>
     <p style="color:#334155">Hi ${input.recipientName}, we received a request to reset your password.</p>
     <p style="margin:24px 0">
       <a href="${input.resetUrl}"
          style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
         Choose a new password
       </a>
     </p>
     <p style="color:#64748b;font-size:13px">This link expires at ${expiry}. If you didn't request this, you can safely ignore this email.</p>`,
  );
  const text = `Reset your Work Calendar password: ${input.resetUrl}\nThis link expires at ${expiry}. If you didn't request it, ignore this email.`;
  return { to: "", subject, html, text };
}

export interface DecisionEmailInput extends BaseTemplateInput {
  shiftLabel: string;
  shiftDate: string;
  approved: boolean;
}

export function applicationDecisionEmail(input: DecisionEmailInput): EmailMessage {
  const verb = input.approved ? "approved" : "not approved";
  const subject = `Your application was ${verb}`;
  const html = shell(
    subject,
    `<h1 style="font-size:20px;color:#0f172a">${subject}</h1>
     <p style="color:#334155">Hi ${input.recipientName}, your application for <strong>${input.shiftLabel}</strong> on ${input.shiftDate} at ${input.businessName} was ${verb}.</p>`,
  );
  const text = `${subject}\nShift: ${input.shiftLabel} (${input.shiftDate}) at ${input.businessName}`;
  return { to: "", subject, html, text };
}

export interface ReminderEmailInput extends BaseTemplateInput {
  shiftLabel: string;
  shiftStart: Date;
}

export function shiftReminderEmail(input: ReminderEmailInput): EmailMessage {
  const subject = `Reminder: ${input.shiftLabel} tomorrow`;
  const when = input.shiftStart.toLocaleString("en-GB");
  const html = shell(
    subject,
    `<h1 style="font-size:20px;color:#0f172a">See you tomorrow</h1>
     <p style="color:#334155">Hi ${input.recipientName}, your shift <strong>${input.shiftLabel}</strong> at ${input.businessName} starts ${when}.</p>`,
  );
  const text = `Shift reminder: ${input.shiftLabel} at ${input.businessName} on ${when}.`;
  return { to: "", subject, html, text };
}

export interface TimeOffDecisionEmailInput extends BaseTemplateInput {
  range: string;
  approved: boolean;
}

export function timeOffDecisionEmail(input: TimeOffDecisionEmailInput): EmailMessage {
  const verb = input.approved ? "approved" : "rejected";
  const subject = `Your time-off request was ${verb}`;
  const html = shell(
    subject,
    `<h1 style="font-size:20px;color:#0f172a">${subject}</h1>
     <p style="color:#334155">Hi ${input.recipientName}, your time-off request for <strong>${input.range}</strong> at ${input.businessName} was ${verb}.</p>`,
  );
  const text = `Time-off ${verb} for ${input.range} at ${input.businessName}.`;
  return { to: "", subject, html, text };
}
