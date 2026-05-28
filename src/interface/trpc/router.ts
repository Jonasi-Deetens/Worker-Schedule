import { compare, hash } from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import {
  managerProcedure,
  mapServiceError,
  ownerProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  workerProcedure,
} from "./init";
import {
  availabilitySchema,
  availabilityTemplateSchema,
  createShiftSchema,
  dateRangeSchema,
  directAssignSchema,
  hoursPeriodSchema,
  idSchema,
  inviteAcceptSchema,
  inviteCreateSchema,
  inviteTokenSchema,
  mePasswordSchema,
  meProfileUpdateSchema,
  publishBatchSchema,
  publishRangeSchema,
  recurringShiftSchema,
  registerSchema,
  rescheduleCheckSchema,
  rosterApplySchema,
  rosterTemplateInputSchema,
  shiftIdSchema,
  skillInputSchema,
  skillUpdateSchema,
  subscriptionIdSchema,
  subscriptionIdsSchema,
  swapDecideSchema,
  swapOfferSchema,
  templateInputSchema,
  templateUpdateSchema,
  timeEntryApproveSchema,
  timeEntryClockInSchema,
  timeEntryClockOutSchema,
  timeOffDecisionSchema,
  timeOffRequestSchema,
  updateShiftSchema,
  workerProfileSchema,
  workerSkillsSchema,
  workerStatusSchema,
} from "./schemas";
import { ShiftService } from "@/application/services/shift-service";
import { AvailabilityService } from "@/application/services/availability-service";
import { SubscriptionService } from "@/application/services/subscription-service";
import { NotificationService } from "@/application/services/notification-service";
import { TemplateService } from "@/application/services/template-service";
import { InviteService } from "@/application/services/invite-service";
import { WorkerService } from "@/application/services/worker-service";
import { SkillService } from "@/application/services/skill-service";
import { TimeOffService } from "@/application/services/timeoff-service";
import { TimeClockService } from "@/application/services/time-clock-service";
import { SwapService } from "@/application/services/swap-service";
import { RosterService } from "@/application/services/roster-service";
import { LocationService } from "@/application/services/location-service";
import { MembershipService } from "@/application/services/membership-service";
import { ShiftMessageService } from "@/application/services/shift-message-service";
import {
  DocumentService,
  isStorageConfigured,
} from "@/application/services/document-service";
import { AnalyticsService } from "@/application/services/analytics-service";
import { GdprService } from "@/application/services/gdpr-service";
import { ApiKeyService, API_SCOPES } from "@/application/services/api-key-service";
import { signCalendarToken } from "@/lib/ical";
import {
  WebhookService,
  WEBHOOK_EVENTS,
} from "@/application/services/webhook-service";
import { StaffingSuggestionsService } from "@/application/services/staffing-suggestions-service";
import { AttendanceService } from "@/application/services/attendance-service";
import { BroadcastService } from "@/application/services/broadcast-service";
import { BulkShiftService } from "@/application/services/bulk-shift-service";
import {
  generateSecret,
  totpAuthUrl,
  verifyTotp,
} from "@/infrastructure/auth/totp";

const shiftService = new ShiftService(prisma);
const availabilityService = new AvailabilityService(prisma);
const subscriptionService = new SubscriptionService(prisma);
const notificationService = new NotificationService(prisma);
const templateService = new TemplateService(prisma);
const inviteService = new InviteService(prisma);
const workerService = new WorkerService(prisma);
const skillService = new SkillService(prisma);
const timeOffService = new TimeOffService(prisma);
const timeClockService = new TimeClockService(prisma);
const swapService = new SwapService(prisma);
const rosterService = new RosterService(prisma);
const locationService = new LocationService(prisma);
const membershipService = new MembershipService(prisma);
const shiftMessageService = new ShiftMessageService(prisma);
const documentService = new DocumentService(prisma);
const analyticsService = new AnalyticsService(prisma);
const gdprService = new GdprService(prisma);
const apiKeyService = new ApiKeyService(prisma);
const webhookService = new WebhookService(prisma);
const staffingSuggestionsService = new StaffingSuggestionsService(prisma);
const attendanceService = new AttendanceService(prisma);
const broadcastService = new BroadcastService(prisma);
const bulkShiftService = new BulkShiftService(prisma);

function requireBusinessId(businessId: string | null): string {
  if (!businessId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No business associated with user",
    });
  }
  return businessId;
}

export const appRouter = router({
  auth: router({
    register: publicProcedure
      .input(registerSchema)
      .mutation(async ({ input }) => {
        const existing = await prisma.user.findUnique({
          where: { email: input.email },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already registered",
          });
        }

        const passwordHash = await hash(input.password, 12);

        if (input.role === "OWNER") {
          if (!input.businessName) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Business name is required for owners",
            });
          }

          const user = await prisma.user.create({
            data: {
              email: input.email,
              passwordHash,
              name: input.name,
              role: "OWNER",
            },
          });

          const business = await prisma.business.create({
            data: {
              name: input.businessName,
              ownerId: user.id,
            },
          });

          await prisma.user.update({
            where: { id: user.id },
            data: { businessId: business.id },
          });

          return { userId: user.id, businessId: business.id };
        }

        if (!input.businessId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Business ID is required for workers",
          });
        }

        const business = await prisma.business.findUnique({
          where: { id: input.businessId },
        });
        if (!business) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Business not found",
          });
        }

        const user = await prisma.user.create({
          data: {
            email: input.email,
            passwordHash,
            name: input.name,
            role: "WORKER",
            businessId: input.businessId,
          },
        });

        return { userId: user.id, businessId: input.businessId };
      }),
  }),

  business: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: {
          workers: { select: { id: true, name: true, email: true } },
        },
      });
      if (!business) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
      }
      return business;
    }),
  }),

  shift: router({
    list: protectedProcedure
      .input(dateRangeSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const isWorker = ctx.session.user.role === "WORKER";
        const workerId = isWorker ? ctx.session.user.id : undefined;
        const isOwnerOrManager =
          ctx.session.user.role === "OWNER" || ctx.session.user.role === "MANAGER";

        let workerSkillIds: string[] | undefined;
        if (isWorker) {
          const skills = await prisma.userSkill.findMany({
            where: { userId: ctx.session.user.id },
            select: { skillId: true },
          });
          workerSkillIds = skills.map((s) => s.skillId);
        }

        return shiftService.listForCalendar({
          businessId,
          from: input.from,
          to: input.to,
          workerId,
          workerSkillIds,
          includeDrafts: isOwnerOrManager,
        });
      }),

    assignments: managerProcedure
      .input(shiftIdSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const shift = await prisma.shift.findFirst({
          where: { id: input.shiftId, businessId },
          include: {
            assignments: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        });
        if (!shift) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return shift.assignments.map((a) => ({
          id: a.id,
          userId: a.userId,
          userName: a.user.name,
          attendance: a.attendance,
        }));
      }),

    create: managerProcedure
      .input(createShiftSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftService.create({
            businessId,
            ownerId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    createRecurring: ownerProcedure
      .input(recurringShiftSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftService.createRecurring({
            businessId,
            ownerId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    kpis: ownerProcedure
      .input(dateRangeSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return shiftService.kpis({
          businessId,
          from: input.from,
          to: input.to,
        });
      }),

    rescheduleConflicts: ownerProcedure
      .input(rescheduleCheckSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftService.findRescheduleConflicts({
            id: input.id,
            businessId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    update: ownerProcedure
      .input(updateShiftSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const { id, ...data } = input;
        try {
          return await shiftService.update({
            id,
            businessId,
            ownerId: ctx.session.user.id,
            ...data,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    delete: ownerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftService.delete({
            id: input.id,
            businessId,
            ownerId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    publish: managerProcedure
      .input(publishBatchSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return shiftService.publish({
          ids: input.ids,
          businessId,
          ownerId: ctx.session.user.id,
        });
      }),

    publishRange: managerProcedure
      .input(publishRangeSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return shiftService.publishRange({
          businessId,
          ownerId: ctx.session.user.id,
          from: input.from,
          to: input.to,
        });
      }),

    assign: managerProcedure
      .input(directAssignSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftService.assignWorker({
            shiftId: input.shiftId,
            workerId: input.workerId,
            businessId,
            ownerId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    broadcast: managerProcedure
      .input(shiftIdSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await broadcastService.send({
            shiftId: input.shiftId,
            businessId,
            ownerId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    acceptBroadcast: workerProcedure
      .input(shiftIdSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await broadcastService.accept({
            shiftId: input.shiftId,
            userId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    duplicateWeek: managerProcedure
      .input(
        z.object({
          fromWeekStart: z.date(),
          toWeekStart: z.date(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await bulkShiftService.duplicateWeek({
            businessId,
            ownerId: ctx.session.user.id,
            fromWeekStart: input.fromWeekStart,
            toWeekStart: input.toWeekStart,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    cancelDay: managerProcedure
      .input(z.object({ date: z.date() }))
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await bulkShiftService.cancelDay({
            businessId,
            ownerId: ctx.session.user.id,
            date: input.date,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    bulkReschedule: managerProcedure
      .input(
        z.object({
          ids: z.array(z.string().cuid()).min(1).max(200),
          deltaMinutes: z.number().int().min(-7 * 24 * 60).max(7 * 24 * 60),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await bulkShiftService.reschedule({
            businessId,
            ownerId: ctx.session.user.id,
            ids: input.ids,
            deltaMinutes: input.deltaMinutes,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    openBroadcasts: workerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      const userId = ctx.session.user.id;
      const broadcasts = await prisma.notification.findMany({
        where: { userId, type: "SHIFT_BROADCAST", readAt: null },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      const shiftIds = broadcasts
        .map((n) => (n.payload as { shiftId?: string } | null)?.shiftId)
        .filter((id): id is string => Boolean(id));
      if (shiftIds.length === 0) return [];

      const shifts = await prisma.shift.findMany({
        where: {
          id: { in: shiftIds },
          businessId,
          endsAt: { gt: new Date() },
          status: { not: "CANCELLED" },
        },
        include: { assignments: { select: { userId: true } } },
      });
      return shifts
        .filter(
          (s) =>
            s.assignments.length < s.requiredSpots &&
            !s.assignments.some((a) => a.userId === userId),
        )
        .map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          roleLabel: s.roleLabel,
          requiredSpots: s.requiredSpots,
          approvedCount: s.assignments.length,
        }));
    }),
  }),

  availability: router({
    list: workerProcedure
      .input(dateRangeSchema)
      .query(async ({ ctx, input }) => {
        return availabilityService.list({
          userId: ctx.session.user.id,
          from: input.from,
          to: input.to,
        });
      }),

    listForBusiness: ownerProcedure
      .input(dateRangeSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return availabilityService.listForBusiness({
          businessId,
          from: input.from,
          to: input.to,
        });
      }),

    set: workerProcedure
      .input(availabilitySchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await availabilityService.set({
            userId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    delete: workerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          await availabilityService.delete({
            id: input.id,
            userId: ctx.session.user.id,
          });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  subscription: router({
    submit: workerProcedure
      .input(shiftIdSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.apply({
            shiftId: input.shiftId,
            userId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    withdraw: workerProcedure
      .input(subscriptionIdSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await subscriptionService.withdraw({
            subscriptionId: input.subscriptionId,
            userId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    listForShift: ownerProcedure
      .input(shiftIdSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.listForShift(
            input.shiftId,
            businessId,
          );
        } catch (error) {
          mapServiceError(error);
        }
      }),

    listMine: workerProcedure.query(async ({ ctx }) => {
      return subscriptionService.listMine(ctx.session.user.id);
    }),

    approveMany: ownerProcedure
      .input(subscriptionIdsSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.approveMany({
            subscriptionIds: input.subscriptionIds,
            ownerId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    rejectMany: ownerProcedure
      .input(subscriptionIdsSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.rejectMany({
            subscriptionIds: input.subscriptionIds,
            ownerId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    approve: ownerProcedure
      .input(subscriptionIdSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.approve({
            subscriptionId: input.subscriptionId,
            ownerId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    reject: ownerProcedure
      .input(subscriptionIdSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await subscriptionService.reject({
            subscriptionId: input.subscriptionId,
            ownerId: ctx.session.user.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  template: router({
    list: ownerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return templateService.list(businessId);
    }),

    create: ownerProcedure
      .input(templateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await templateService.create({
            businessId,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    update: ownerProcedure
      .input(templateUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          const { id, ...data } = input;
          return await templateService.update({
            id,
            businessId,
            ...data,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    delete: ownerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await templateService.delete({
            id: input.id,
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  notification: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(100).optional(),
            cursor: z.string().cuid().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        return notificationService.list({
          userId: ctx.session.user.id,
          limit: input?.limit,
          cursor: input?.cursor,
        });
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return notificationService.unreadCount(ctx.session.user.id);
    }),

    markRead: protectedProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await notificationService.markRead({
            id: input.id,
            userId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      return notificationService.markAllRead(ctx.session.user.id);
    }),
  }),

  invite: router({
    list: managerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return inviteService.listForBusiness(businessId);
    }),

    create: managerProcedure
      .input(inviteCreateSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await inviteService.create({
            businessId,
            invitedById: ctx.session.user.id,
            email: input.email,
            role: input.role,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    revoke: managerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          await inviteService.revoke({ id: input.id, businessId });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),

    lookup: publicProcedure
      .input(inviteTokenSchema)
      .query(async ({ input }) => {
        const invite = await inviteService.findByToken(input.token);
        if (!invite) return null;
        return {
          businessName: invite.business.name,
          email: invite.email,
          expiresAt: invite.expiresAt,
          acceptedAt: invite.acceptedAt,
        };
      }),

    accept: publicProcedure
      .input(inviteAcceptSchema)
      .mutation(async ({ input }) => {
        try {
          const result = await inviteService.accept(input);
          return {
            userId: result.user.id,
            email: result.user.email,
            businessId: result.businessId,
          };
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  worker: router({
    list: managerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return workerService.list(businessId);
    }),

    get: managerProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerService.get({ id: input.id, businessId });
      } catch (error) {
        mapServiceError(error);
      }
    }),

    stats: managerProcedure.input(idSchema).query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return workerService.stats({ id: input.id, businessId });
    }),

    documents: managerProcedure
      .input(idSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return workerService.documents({ id: input.id, businessId });
      }),

    update: managerProcedure
      .input(workerProfileSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await workerService.updateProfile({
            businessId,
            actorId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    setStatus: ownerProcedure
      .input(workerStatusSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await workerService.setStatus({
            id: input.id,
            businessId,
            actorId: ctx.session.user.id,
            status: input.status,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),

    setSkills: managerProcedure
      .input(workerSkillsSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await workerService.setSkills({
            userId: input.userId,
            businessId,
            skillIds: input.skillIds,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  skill: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return skillService.list(businessId);
    }),
    create: managerProcedure
      .input(skillInputSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await skillService.create({ businessId, ...input });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    update: managerProcedure
      .input(skillUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await skillService.update({ businessId, ...input });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: managerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          await skillService.delete({ id: input.id, businessId });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  timeOff: router({
    request: workerProcedure
      .input(timeOffRequestSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await timeOffService.request({
            userId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    listMine: protectedProcedure.query(async ({ ctx }) => {
      return timeOffService.listForUser(ctx.session.user.id);
    }),
    listForBusiness: managerProcedure
      .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }))
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return timeOffService.listForBusiness(businessId, input.status);
      }),
    decide: managerProcedure
      .input(timeOffDecisionSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await timeOffService.decide({
            id: input.id,
            ownerId: ctx.session.user.id,
            businessId,
            approve: input.approve,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    cancel: workerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await timeOffService.cancel({
            id: input.id,
            userId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  availabilityTemplate: router({
    list: workerProcedure.query(async ({ ctx }) => {
      return availabilityService.listTemplates(ctx.session.user.id);
    }),
    create: workerProcedure
      .input(availabilityTemplateSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await availabilityService.setTemplate({
            userId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: workerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          await availabilityService.deleteTemplate({
            id: input.id,
            userId: ctx.session.user.id,
          });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
    materialise: workerProcedure
      .input(dateRangeSchema)
      .mutation(async ({ ctx, input }) => {
        const count = await availabilityService.materialiseTemplates(
          ctx.session.user.id,
          input.from,
          input.to,
        );
        return { count };
      }),
  }),

  me: router({
    /**
     * Single round-trip used by the mobile worker home screen. Bundles the
     * next shift, open broadcasts, pending application count, unread
     * notifications and this-week scheduled hours so the home view paints in
     * one render.
     */
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const businessId = ctx.session.user.businessId ?? null;
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setHours(23, 59, 59, 999);
      // Monday-anchored ISO week start.
      const weekStart = new Date(now);
      const day = (weekStart.getDay() + 6) % 7; // 0=Mon
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - day);
      const weekStartPlus7 = new Date(weekStart);
      weekStartPlus7.setDate(weekStartPlus7.getDate() + 7);

      const [nextAssignment, pending, unread, weekShifts, openBroadcasts] =
        await Promise.all([
          prisma.shiftAssignment.findFirst({
            where: {
              userId,
              shift: { endsAt: { gt: now }, status: { not: "CANCELLED" } },
            },
            orderBy: { shift: { startsAt: "asc" } },
            include: {
              shift: {
                select: {
                  id: true,
                  startsAt: true,
                  endsAt: true,
                  roleLabel: true,
                  notes: true,
                  location: { select: { name: true } },
                },
              },
            },
          }),
          prisma.shiftSubscription.count({
            where: { userId, status: "PENDING" },
          }),
          prisma.notification.count({
            where: { userId, readAt: null },
          }),
          prisma.shiftAssignment.findMany({
            where: {
              userId,
              shift: {
                startsAt: { gte: weekStart, lt: weekStartPlus7 },
                status: { not: "CANCELLED" },
              },
            },
            include: {
              shift: { select: { startsAt: true, endsAt: true } },
            },
          }),
          businessId
            ? prisma.notification.findMany({
                where: { userId, type: "SHIFT_BROADCAST", readAt: null },
                orderBy: { createdAt: "desc" },
                take: 25,
              })
            : Promise.resolve([] as { payload: unknown }[]),
        ]);

      const broadcastShiftIds = (openBroadcasts as { payload: unknown }[])
        .map((n) => (n.payload as { shiftId?: string } | null)?.shiftId)
        .filter((id): id is string => Boolean(id));
      const broadcasts =
        broadcastShiftIds.length === 0 || !businessId
          ? []
          : (
              await prisma.shift.findMany({
                where: {
                  id: { in: broadcastShiftIds },
                  businessId,
                  endsAt: { gt: now },
                  status: { not: "CANCELLED" },
                },
                include: { assignments: { select: { userId: true } } },
              })
            )
              .filter(
                (s) =>
                  s.assignments.length < s.requiredSpots &&
                  !s.assignments.some((a) => a.userId === userId),
              )
              .map((s) => ({
                id: s.id,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                roleLabel: s.roleLabel,
              }));

      const scheduledHoursThisWeek = weekShifts.reduce((sum, a) => {
        const h =
          (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 3_600_000;
        return sum + h;
      }, 0);

      return {
        nextShift: nextAssignment
          ? {
              assignmentId: nextAssignment.id,
              shiftId: nextAssignment.shift.id,
              startsAt: nextAssignment.shift.startsAt,
              endsAt: nextAssignment.shift.endsAt,
              roleLabel: nextAssignment.shift.roleLabel,
              notes: nextAssignment.shift.notes,
              locationName: nextAssignment.shift.location?.name ?? null,
            }
          : null,
        pendingApplications: pending,
        unreadNotifications: unread,
        scheduledHoursThisWeek,
        broadcasts,
      };
    }),
    /**
     * Returns the personal ICS calendar URL workers can subscribe to from
     * Apple/Google Calendar etc. The URL is signed with NEXTAUTH_SECRET and a
     * per-user rotation counter, so calling `rotateCalendarToken` instantly
     * invalidates the previously-shared link.
     */
    calendarUrl: protectedProcedure.query(async ({ ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { id: true, icsRotation: true },
      });
      const secret = process.env.NEXTAUTH_SECRET;
      const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
      if (!user || !secret) return { url: null };
      const token = signCalendarToken(user.id, secret, user.icsRotation);
      const path = `/api/calendar.ics?userId=${encodeURIComponent(
        user.id,
      )}&token=${token}`;
      return { url: base ? `${base}${path}` : path };
    }),
    rotateCalendarToken: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { icsRotation: { increment: 1 } },
        select: { id: true, icsRotation: true },
      });
      const secret = process.env.NEXTAUTH_SECRET;
      const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
      if (!secret) return { url: null };
      const token = signCalendarToken(user.id, secret, user.icsRotation);
      const path = `/api/calendar.ics?userId=${encodeURIComponent(
        user.id,
      )}&token=${token}`;
      return { url: base ? `${base}${path}` : path };
    }),
    profile: protectedProcedure.query(async ({ ctx }) => {
      return prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatarUrl: true,
          locale: true,
          notificationPrefs: true,
          role: true,
          status: true,
          contractType: true,
        },
      });
    }),
    updateProfile: protectedProcedure
      .input(meProfileUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        return prisma.user.update({
          where: { id: ctx.session.user.id },
          data: {
            name: input.name,
            phone: input.phone,
            locale: input.locale,
            avatarUrl: input.avatarUrl,
            notificationPrefs: input.notificationPrefs,
          },
        });
      }),
    changePassword: protectedProcedure
      .input(mePasswordSchema)
      .mutation(async ({ ctx, input }) => {
        const user = await prisma.user.findUnique({
          where: { id: ctx.session.user.id },
        });
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        const valid = await compare(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hash(input.newPassword, 12) },
        });
        return { success: true };
      }),
    hours: protectedProcedure
      .input(hoursPeriodSchema)
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const total = await workerService.aggregateHours(
          ctx.session.user.id,
          businessId,
          input.from,
          input.to,
        );
        return { total };
      }),
  }),

  timeClock: router({
    active: protectedProcedure.query(async ({ ctx }) => {
      return timeClockService.activeFor(ctx.session.user.id);
    }),
    clockIn: protectedProcedure
      .input(timeEntryClockInSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await timeClockService.clockIn({
            userId: ctx.session.user.id,
            shiftId: input.shiftId ?? null,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    clockOut: protectedProcedure
      .input(timeEntryClockOutSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await timeClockService.clockOut({
            id: input.id,
            userId: ctx.session.user.id,
            breakMinutes: input.breakMinutes ?? 0,
            notes: input.notes,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    listPending: managerProcedure
      .input(dateRangeSchema.partial().optional())
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return timeClockService.listPending(businessId, input?.from, input?.to);
      }),
    approve: managerProcedure
      .input(timeEntryApproveSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await timeClockService.approveMany({
            ids: input.ids,
            businessId,
            approverId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    listMine: protectedProcedure
      .input(dateRangeSchema)
      .query(async ({ ctx, input }) => {
        return timeClockService.listMine(
          ctx.session.user.id,
          input.from,
          input.to,
        );
      }),
  }),

  swap: router({
    offer: workerProcedure
      .input(swapOfferSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await swapService.offer({
            subscriptionId: input.subscriptionId,
            fromUserId: ctx.session.user.id,
            toUserId: input.toUserId,
            message: input.message,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    listMine: workerProcedure.query(async ({ ctx }) => {
      return swapService.listMine(ctx.session.user.id);
    }),
    /**
     * Returns workers in the same business that the requesting worker can
     * offer their shift to: active, distinct, and free of any overlapping
     * assignment or approved time-off in the slot.
     */
    candidates: workerProcedure
      .input(z.object({ subscriptionId: z.string().cuid() }))
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const subscription = await prisma.shiftSubscription.findFirst({
          where: {
            id: input.subscriptionId,
            userId: ctx.session.user.id,
            status: "APPROVED",
          },
          include: { shift: true },
        });
        if (!subscription) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const candidates = await prisma.user.findMany({
          where: {
            businessId,
            status: "ACTIVE",
            id: { not: ctx.session.user.id },
            role: { in: ["WORKER", "MANAGER"] },
            ...(subscription.shift.requiredSkillId
              ? {
                  skills: {
                    some: { skillId: subscription.shift.requiredSkillId },
                  },
                }
              : {}),
          },
          select: { id: true, name: true },
        });
        const [overlap, conflicts] = await Promise.all([
          prisma.shiftAssignment.findMany({
            where: {
              userId: { in: candidates.map((c) => c.id) },
              shift: {
                startsAt: { lt: subscription.shift.endsAt },
                endsAt: { gt: subscription.shift.startsAt },
              },
            },
            select: { userId: true },
          }),
          prisma.timeOffRequest.findMany({
            where: {
              userId: { in: candidates.map((c) => c.id) },
              status: "APPROVED",
              startsAt: { lt: subscription.shift.endsAt },
              endsAt: { gt: subscription.shift.startsAt },
            },
            select: { userId: true },
          }),
        ]);
        const blocked = new Set<string>([
          ...overlap.map((a) => a.userId),
          ...conflicts.map((c) => c.userId),
        ]);
        return candidates.filter((c) => !blocked.has(c.id));
      }),
    decide: workerProcedure
      .input(swapDecideSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await swapService.decide({
            id: input.id,
            decidingUserId: ctx.session.user.id,
            accept: input.accept,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    cancel: workerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await swapService.cancel({
            id: input.id,
            requestingUserId: ctx.session.user.id,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  roster: router({
    list: managerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return rosterService.list(businessId);
    }),
    create: managerProcedure
      .input(rosterTemplateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await rosterService.create({ businessId, ...input });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: managerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          await rosterService.delete({ id: input.id, businessId });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
    applyToWeek: managerProcedure
      .input(rosterApplySchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await rosterService.applyToWeek({
            businessId,
            ownerId: ctx.session.user.id,
            rosterId: input.rosterId,
            weekStart: input.weekStart,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  location: router({
    list: managerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return locationService.list(businessId);
    }),
    create: managerProcedure
      .input(
        z.object({
          name: z.string().min(1),
          address: z.string().optional(),
          timezone: z.string().optional(),
          geofenceLat: z.number().optional(),
          geofenceLng: z.number().optional(),
          geofenceRadiusM: z.number().int().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await locationService.create({ businessId, ...input });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    update: managerProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).optional(),
          address: z.string().nullable().optional(),
          timezone: z.string().optional(),
          geofenceLat: z.number().nullable().optional(),
          geofenceLng: z.number().nullable().optional(),
          geofenceRadiusM: z.number().int().positive().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await locationService.update({ businessId, ...input });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: managerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          await locationService.delete({ id: input.id, businessId });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  membership: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      return membershipService.listForUser(ctx.session.user.id);
    }),
  }),

  shiftMessage: router({
    list: protectedProcedure
      .input(z.object({ shiftId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await shiftMessageService.list({
            shiftId: input.shiftId,
            userId: ctx.session.user.id,
            isOwnerOrManager:
              ctx.session.user.role === "OWNER" ||
              ctx.session.user.role === "MANAGER",
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    post: protectedProcedure
      .input(z.object({ shiftId: z.string(), body: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await shiftMessageService.post({
            shiftId: input.shiftId,
            authorId: ctx.session.user.id,
            body: input.body,
            isOwnerOrManager:
              ctx.session.user.role === "OWNER" ||
              ctx.session.user.role === "MANAGER",
            businessId,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  document: router({
    storageStatus: protectedProcedure.query(() => {
      return { configured: isStorageConfigured() };
    }),
    presignUpload: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(120),
          contentType: z.string().min(1).max(120),
          sizeBytes: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return documentService.presignUpload({
            userId: ctx.session.user.id,
            fileName: input.fileName,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    listMine: protectedProcedure.query(async ({ ctx }) => {
      return documentService.listForUser(ctx.session.user.id);
    }),
    listExpiring: managerProcedure
      .input(z.object({ days: z.number().int().positive().max(180).default(30) }))
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return documentService.listForBusiness(businessId, {
          expiringWithinDays: input.days,
        });
      }),
    create: protectedProcedure
      .input(
        z.object({
          kind: z.enum([
            "ID_CARD",
            "WORK_CONTRACT",
            "RESIDENCE_PERMIT",
            "FOOD_SAFETY",
            "OTHER",
          ]),
          url: z.string().url(),
          fileName: z.string().min(1),
          contentType: z.string().optional(),
          sizeBytes: z.number().int().positive().optional(),
          expiresOn: z.date().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await documentService.create({
            userId: ctx.session.user.id,
            kind: input.kind,
            url: input.url,
            fileName: input.fileName,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
            expiresOn: input.expiresOn ?? null,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: protectedProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const isOwnerOrManager =
          ctx.session.user.role === "OWNER" ||
          ctx.session.user.role === "MANAGER";
        try {
          await documentService.delete({
            id: input.id,
            userId: ctx.session.user.id,
            isOwnerOrManager,
          });
          return { success: true };
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  analytics: router({
    weekly: managerProcedure
      .input(z.object({ weeks: z.number().int().min(1).max(52).default(12) }))
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return analyticsService.weeklyTrend({ businessId, weeks: input.weeks });
      }),
  }),

  twoFactor: router({
    setup: protectedProcedure.mutation(async ({ ctx }) => {
      const secret = generateSecret();
      const url = totpAuthUrl({
        account: ctx.session.user.email,
        issuer: "Tattoogenda",
        secret,
      });
      return { secret, otpauthUrl: url };
    }),
    enable: protectedProcedure
      .input(z.object({ secret: z.string(), token: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        if (!verifyTotp(input.secret, input.token)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
        }
        await prisma.user.update({
          where: { id: ctx.session.user.id },
          data: { twoFactorSecret: input.secret },
        });
        return { success: true };
      }),
    disable: protectedProcedure.mutation(async ({ ctx }) => {
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { twoFactorSecret: null },
      });
      return { success: true };
    }),
  }),

  gdpr: router({
    exportMine: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await gdprService.exportUser(ctx.session.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),
    deleteMine: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        return await gdprService.softDelete(ctx.session.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),
  }),

  apiKey: router({
    list: ownerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return apiKeyService.list(businessId);
    }),
    create: ownerProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          scopes: z.array(z.enum(API_SCOPES)).min(1),
          expiresAt: z.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await apiKeyService.create({
            businessId,
            name: input.name,
            scopes: input.scopes,
            expiresAt: input.expiresAt ?? null,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    revoke: ownerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await apiKeyService.revoke({ id: input.id, businessId });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  webhook: router({
    list: ownerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return webhookService.list(businessId);
    }),
    create: ownerProcedure
      .input(
        z.object({
          url: z.string().url(),
          events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await webhookService.create({
            businessId,
            url: input.url,
            events: input.events,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    delete: ownerProcedure
      .input(idSchema)
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await webhookService.delete({ id: input.id, businessId });
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  staffing: router({
    suggest: managerProcedure
      .input(z.object({ shiftId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await staffingSuggestionsService.rankForShift(input.shiftId);
        } catch (error) {
          mapServiceError(error);
        }
      }),
  }),

  attendance: router({
    mark: managerProcedure
      .input(
        z.object({
          assignmentId: z.string(),
          status: z.enum(["ON_TIME", "LATE", "NO_SHOW", "EXCUSED"]),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        try {
          return await attendanceService.mark({
            assignmentId: input.assignmentId,
            businessId,
            reviewerId: ctx.session.user.id,
            status: input.status,
            note: input.note,
          });
        } catch (error) {
          mapServiceError(error);
        }
      }),
    workerStats: protectedProcedure
      .input(
        z.object({
          userId: z.string(),
          from: z.date(),
          to: z.date(),
        }),
      )
      .query(async ({ ctx, input }) => {
        if (
          ctx.session.user.role === "WORKER" &&
          ctx.session.user.id !== input.userId
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return attendanceService.statsForWorker(input);
      }),
    businessSummary: managerProcedure
      .input(z.object({ from: z.date(), to: z.date() }))
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        return attendanceService.businessSummary({
          businessId,
          from: input.from,
          to: input.to,
        });
      }),
  }),

  audit: router({
    /**
     * Paginated search over the audit log scoped to the calling owner's
     * business. Filters are all optional and combine with AND semantics; the
     * server caps `take` at 200 to keep the query cheap.
     */
    search: ownerProcedure
      .input(
        z.object({
          q: z.string().max(120).optional(),
          action: z.string().max(64).optional(),
          userId: z.string().cuid().optional(),
          from: z.date().optional(),
          to: z.date().optional(),
          cursor: z.string().optional(),
          take: z.number().int().min(1).max(200).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        const businessId = requireBusinessId(ctx.session.user.businessId);
        const members = await prisma.user.findMany({
          where: {
            OR: [
              { businessId },
              { ownedBusiness: { id: businessId } },
            ],
          },
          select: { id: true },
        });
        const where: Record<string, unknown> = {
          userId: { in: members.map((m) => m.id) },
        };
        if (input.action) where.action = input.action;
        if (input.userId) where.userId = input.userId;
        if (input.from || input.to) {
          where.createdAt = {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lt: input.to } : {}),
          };
        }
        if (input.q) {
          const q = input.q;
          where.OR = [
            { entityId: { contains: q, mode: "insensitive" } },
            { entityType: { contains: q, mode: "insensitive" } },
            { action: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
          ];
        }
        const events = await prisma.auditEvent.findMany({
          where,
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: input.take + 1,
          ...(input.cursor
            ? { cursor: { id: input.cursor }, skip: 1 }
            : {}),
        });
        let nextCursor: string | null = null;
        if (events.length > input.take) {
          const last = events.pop();
          nextCursor = last ? last.id : null;
        }
        return { events, nextCursor };
      }),

    /** Distinct list of business members for the user filter dropdown. */
    members: ownerProcedure.query(async ({ ctx }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      const members = await prisma.user.findMany({
        where: {
          OR: [
            { businessId },
            { ownedBusiness: { id: businessId } },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return members;
    }),
  }),
});

export type AppRouter = typeof appRouter;
