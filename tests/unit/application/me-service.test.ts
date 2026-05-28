import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { MeService } from "@/application/services/me-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const ORIGINAL_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

let db: PrismaMock;
let service: MeService;

beforeEach(() => {
  db = createPrismaMock();
  service = new MeService(asPrisma(db));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_NEXTAUTH_SECRET === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET;
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
});

describe("MeService.profile / updateProfile", () => {
  it("returns the profile projection for the current user", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Alex" });
    expect(await service.profile("u1")).toMatchObject({ id: "u1", name: "Alex" });
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });

  it("forwards the allowed profile fields to the update query", async () => {
    db.user.update.mockResolvedValue({ id: "u1" });
    await service.updateProfile("u1", {
      name: "New",
      phone: null,
      locale: "nl",
      avatarUrl: "https://cdn/x.png",
      notificationPrefs: { email: { INVITE: false } },
    });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          name: "New",
          phone: null,
          locale: "nl",
          avatarUrl: "https://cdn/x.png",
        }),
      }),
    );
  });
});

describe("MeService.changePassword", () => {
  it("rejects when the current password is wrong", async () => {
    const goodHash = await hash("right-password", 4);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      passwordHash: goodHash,
    });
    await expect(
      service.changePassword({
        userId: "u1",
        currentPassword: "wrong",
        newPassword: "another1",
      }),
    ).rejects.toThrow(/current password/i);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("writes a new hash when the current password matches", async () => {
    const currentHash = await hash("right-password", 4);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      passwordHash: currentHash,
    });
    db.user.update.mockResolvedValue({ id: "u1" });
    const result = await service.changePassword({
      userId: "u1",
      currentPassword: "right-password",
      newPassword: "brand-new-pw",
    });
    expect(result).toEqual({ success: true });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });
});

describe("MeService.calendarUrl", () => {
  it("returns null when NEXTAUTH_SECRET is missing", async () => {
    delete process.env.NEXTAUTH_SECRET;
    db.user.findUnique.mockResolvedValue({ id: "u1", icsRotation: 0 });
    expect(await service.calendarUrl("u1")).toEqual({ url: null });
  });

  it("builds a signed URL when configured", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "https://app.test/";
    db.user.findUnique.mockResolvedValue({ id: "u1", icsRotation: 3 });
    const { url } = await service.calendarUrl("u1");
    expect(url).toContain("https://app.test/api/calendar.ics");
    expect(url).toContain("userId=u1");
    expect(url).toMatch(/token=[A-Za-z0-9._-]+/);
  });
});
