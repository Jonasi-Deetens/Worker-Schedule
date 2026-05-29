import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import {
  managerProcedure,
  mapServiceError,
  ownerProcedure,
  protectedProcedure,
  router,
  workerProcedure,
} from "../init";
import {
  createShiftSchema,
  dateRangeSchema,
  directAssignSchema,
  idSchema,
  publishBatchSchema,
  publishRangeSchema,
  recurringShiftSchema,
  rescheduleCheckSchema,
  shiftIdSchema,
  updateShiftSchema,
} from "../schemas";
import {
  broadcastService,
  bulkShiftService,
  requireBusinessId,
  shiftAssignmentService,
  shiftReadModel,
  shiftService,
} from "../services";

export const shiftRouter = router({
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

      return shiftReadModel.listForCalendar({
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
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
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
        avatarUrl: a.user.avatarUrl ?? null,
        status: a.status,
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
      return shiftReadModel.kpis({
        businessId,
        from: input.from,
        to: input.to,
      });
    }),

  rescheduleConflicts: managerProcedure
    .input(rescheduleCheckSchema)
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await shiftAssignmentService.findRescheduleConflicts({
          id: input.id,
          businessId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  update: managerProcedure
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
        return await shiftAssignmentService.assignWorker({
          shiftId: input.shiftId,
          workerId: input.workerId,
          businessId,
          ownerId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  unassign: managerProcedure
    .input(directAssignSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await shiftAssignmentService.unassignWorker({
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
    return broadcastService.listForUser({
      userId: ctx.session.user.id,
      businessId,
    });
  }),

  pendingReconfirmations: workerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return shiftAssignmentService.listPendingReconfirmations({
      userId: ctx.session.user.id,
      businessId,
    });
  }),

  confirmReschedule: workerProcedure
    .input(shiftIdSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await shiftAssignmentService.confirmReschedule({
          shiftId: input.shiftId,
          userId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  declineReschedule: workerProcedure
    .input(shiftIdSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await shiftAssignmentService.declineReschedule({
          shiftId: input.shiftId,
          userId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
