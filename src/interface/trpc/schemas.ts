import { z } from "zod";

export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const createShiftSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    roleLabel: z.string().min(1).max(100),
    requiredSpots: z.number().int().min(1).max(50),
    notes: z.string().max(500).optional(),
    requiredSkillId: z.string().cuid().nullable().optional(),
    locationId: z.string().cuid().nullable().optional(),
    publish: z.boolean().optional(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  });

export const updateShiftSchema = z.object({
  id: z.string().cuid(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  roleLabel: z.string().min(1).max(100).optional(),
  requiredSpots: z.number().int().min(1).max(50).optional(),
  notes: z.string().max(500).nullable().optional(),
  requiredSkillId: z.string().cuid().nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
});

export const availabilitySchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  });

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
  role: z.enum(["OWNER", "WORKER"]),
  businessName: z.string().min(1).max(100).optional(),
  businessId: z.string().cuid().optional(),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(8).max(500),
  newPassword: z.string().min(8).max(100),
});

export const idSchema = z.object({ id: z.string().cuid() });
export const shiftIdSchema = z.object({ shiftId: z.string().cuid() });
export const subscriptionIdSchema = z.object({
  subscriptionId: z.string().cuid(),
});

export const recurringShiftSchema = createShiftSchema.and(
  z.object({
    repeatUntil: z.coerce.date(),
  }),
);

export const subscriptionIdsSchema = z.object({
  subscriptionIds: z.array(z.string().cuid()).min(1).max(50),
});

export const rescheduleCheckSchema = z.object({
  id: z.string().cuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

const HHMM = z.string().regex(/^\d{2}:\d{2}$/);

export const templateInputSchema = z.object({
  name: z.string().min(1).max(100),
  roleLabel: z.string().min(1).max(100),
  requiredSpots: z.number().int().min(1).max(50),
  defaultStart: HHMM,
  defaultEnd: HHMM,
  notes: z.string().max(500).nullable().optional(),
});

export const templateUpdateSchema = templateInputSchema.partial().extend({
  id: z.string().cuid(),
});

export const inviteCreateSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(["WORKER", "MANAGER"]).default("WORKER"),
});

export const inviteTokenSchema = z.object({
  token: z.string().min(8).max(200),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(8).max(200),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
  // Only used for link-only invites that were created without a fixed email.
  email: z.string().email().optional(),
});

export const skillInputSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const skillUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const workerProfileSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(40).nullable().optional(),
  contractType: z
    .enum(["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"])
    .nullable()
    .optional(),
  hourlyRate: z.number().min(0).max(1000).nullable().optional(),
  weeklyHourCap: z.number().int().min(0).max(80).nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
  // Belgian national number (NISS/rijksregisternummer): 11 digits, optionally
  // grouped with dots/dashes. Validated loosely on digit count only.
  nationalNumber: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null || v === "" || /^\d{11}$/.test(v.replace(/\D/g, "")),
      { message: "National number must be 11 digits" },
    ),
});

export const workerStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
});

export const workerSkillsSchema = z.object({
  userId: z.string().cuid(),
  skillIds: z.array(z.string().cuid()).max(50),
});

export const meProfileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(40).nullable().optional(),
  locale: z.enum(["en", "nl", "fr"]).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  notificationPrefs: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

export const mePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
});

export const timeOffRequestSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  });

export const timeOffDecisionSchema = z.object({
  id: z.string().cuid(),
  approve: z.boolean(),
});

export const timeOffUpdateSchema = z
  .object({
    id: z.string().cuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  });

export const availabilityTemplateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  validUntil: z.coerce.date().nullable().optional(),
});

export const availabilityTemplateUpdateSchema = z.object({
  id: z.string().cuid(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

export const publishRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const publishBatchSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
});

export const directAssignSchema = z.object({
  shiftId: z.string().cuid(),
  workerId: z.string().cuid(),
});

export const hoursPeriodSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const timeEntryClockInSchema = z.object({
  shiftId: z.string().cuid().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const timeEntryClockOutSchema = z.object({
  id: z.string().cuid(),
  breakMinutes: z.number().int().min(0).max(360).optional(),
  notes: z.string().max(500).optional(),
});

export const timeEntryApproveSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
});

export const timeEntryRejectSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  reason: z.string().max(500).optional(),
});

export const timeEntryUpdateSchema = z.object({
  id: z.string().cuid(),
  clockInAt: z.coerce.date().optional(),
  clockOutAt: z.coerce.date().nullable().optional(),
  breakMinutes: z.number().int().min(0).max(720).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const swapOfferSchema = z.object({
  subscriptionId: z.string().cuid(),
  toUserId: z.string().cuid(),
  message: z.string().max(500).optional(),
});

export const swapDecideSchema = z.object({
  id: z.string().cuid(),
  accept: z.boolean(),
});

export const rosterTemplateInputSchema = z.object({
  name: z.string().min(1).max(100),
  shifts: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        roleLabel: z.string().min(1).max(100),
        requiredSpots: z.number().int().min(1).max(50),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const rosterApplySchema = z.object({
  rosterId: z.string().cuid(),
  weekStart: z.coerce.date(),
});
