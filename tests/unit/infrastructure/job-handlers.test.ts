import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

import type { PrismaClient } from "@prisma/client";
import {
  runInviteCleanup,
  runShiftReminders24h,
  runAvailabilityMaterialise,
  runDimonaReconcile,
} from "@/infrastructure/jobs/handlers";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("Job handlers", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("invite cleanup deletes expired unaccepted invites past grace", async () => {
    db.invite.deleteMany.mockResolvedValue({ count: 3 });
    const res = await runInviteCleanup(db as unknown as PrismaClient, 7);
    expect(res.deleted).toBe(3);
    expect(db.invite.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          acceptedAt: null,
          expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });

  it("24h reminders notifies each assignee and marks shift as reminded", async () => {
    db.shift.findMany.mockResolvedValue([
      {
        id: "s1",
        startsAt: new Date(Date.now() + 24 * 3_600_000),
        roleLabel: "Bar",
        assignments: [
          { userId: "u1", user: { id: "u1", name: "Alice" } },
          { userId: "u2", user: { id: "u2", name: "Bob" } },
        ],
      },
    ]);
    db.notification.create.mockResolvedValue({ id: "n1" });
    db.shift.update.mockResolvedValue({});
    db.pushSubscription.findMany.mockResolvedValue([]);
    const res = await runShiftReminders24h(db as unknown as PrismaClient);
    expect(res.shifts).toBe(1);
    expect(res.recipients).toBe(2);
    expect(db.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
      }),
    );
  });

  it("availability materialise iterates active users with templates", async () => {
    db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    db.availabilityTemplate.findMany.mockResolvedValue([]);
    const res = await runAvailabilityMaterialise(
      db as unknown as PrismaClient,
      7,
    );
    expect(res.users).toBe(2);
    expect(res.created).toBe(0);
  });

  it("dimona reconcile walks each business with an employer id", async () => {
    db.business.findMany.mockResolvedValue([{ id: "b1" }]);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    const res = await runDimonaReconcile(db as unknown as PrismaClient);
    expect(res.businesses).toBe(1);
    expect(res.gaps).toBe(0);
  });
});
