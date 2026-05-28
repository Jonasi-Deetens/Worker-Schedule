import { describe, expect, it } from "vitest";
import { EmailService, isOptedIn } from "@/application/services/email-service";
import { InMemoryEmailTransport } from "@/infrastructure/email/transport";

describe("EmailService", () => {
  describe("isOptedIn", () => {
    it("defaults to enabled when prefs are missing", () => {
      expect(isOptedIn(null, "INVITE")).toBe(true);
      expect(isOptedIn({}, "INVITE")).toBe(true);
    });

    it("respects explicit false flags", () => {
      expect(isOptedIn({ email: { INVITE: false } }, "INVITE")).toBe(false);
      expect(isOptedIn({ email: { INVITE: true } }, "INVITE")).toBe(true);
    });

    it("enables when a different event is flagged off", () => {
      expect(isOptedIn({ email: { INVITE: false } }, "SHIFT_REMINDER")).toBe(true);
    });
  });

  it("does not call the transport when the user opted out", async () => {
    const transport = new InMemoryEmailTransport();
    const svc = new EmailService(transport);
    await svc.sendInvite(
      { email: "x@y.com", name: "X" },
      {
        recipientName: "X",
        businessName: "B",
        inviteUrl: "https://x",
        expiresAt: new Date(),
      },
    );
    expect(transport.messages()).toHaveLength(1);
  });
});
