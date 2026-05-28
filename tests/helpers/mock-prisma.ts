import { vi, type Mock } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * A small typed factory that creates a Prisma stub for service-level tests.
 * Each model gets vi.fn() mocks for the methods our services touch so tests
 * can configure responses (e.g. `db.shift.findFirst.mockResolvedValue(...)`).
 */
type ModelMethods =
  | "create"
  | "createMany"
  | "findUnique"
  | "findFirst"
  | "findMany"
  | "update"
  | "updateMany"
  | "delete"
  | "deleteMany"
  | "count"
  | "upsert"
  | "groupBy"
  | "aggregate";

const MODEL_KEYS = [
  "user",
  "business",
  "shift",
  "shiftTemplate",
  "availability",
  "availabilityTemplate",
  "shiftSubscription",
  "shiftAssignment",
  "notification",
  "auditEvent",
  "invite",
  "skill",
  "userSkill",
  "timeOffRequest",
  "timeEntry",
  "shiftSwap",
  "rosterTemplate",
  "rosterTemplateShift",
  "location",
  "membership",
  "document",
  "shiftMessage",
  "dimonaDeclaration",
  "apiKey",
  "webhookSubscription",
  "webAuthnCredential",
  "pushSubscription",
] as const;

type ModelKey = (typeof MODEL_KEYS)[number];

export type PrismaMock = {
  [K in ModelKey]: Record<ModelMethods, Mock>;
} & {
  $transaction: Mock;
};

function buildModelMock(): Record<ModelMethods, Mock> {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  };
}

export function createPrismaMock(): PrismaMock {
  const mock = MODEL_KEYS.reduce<Partial<PrismaMock>>((acc, key) => {
    acc[key] = buildModelMock();
    return acc;
  }, {}) as PrismaMock;

  mock.$transaction = vi.fn(
    async (arg: ((tx: PrismaMock) => unknown) | unknown[]) => {
      if (typeof arg === "function") return arg(mock);
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg;
    },
  );
  return mock;
}

/**
 * Casts the mock to the PrismaClient type expected by services. The cast is
 * confined to test code so production code stays strictly typed.
 */
export function asPrisma(mock: PrismaMock): PrismaClient {
  return mock as unknown as PrismaClient;
}
