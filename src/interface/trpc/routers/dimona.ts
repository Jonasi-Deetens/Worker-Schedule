import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  router,
} from "../init";
import { idSchema } from "../schemas";
import { dimonaService, prisma, requireBusinessId } from "../services";

export const dimonaRouter = router({
  list: managerProcedure
    .input(
      z
        .object({
          status: z
            .enum(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      const declarations = await prisma.dimonaDeclaration.findMany({
        where: {
          shift: { businessId },
          ...(input?.status ? { status: input.status } : {}),
        },
        include: {
          shift: {
            select: {
              id: true,
              roleLabel: true,
              startsAt: true,
              endsAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const workerIds = [...new Set(declarations.map((d) => d.workerId))];
      const workers = await prisma.user.findMany({
        where: { id: { in: workerIds } },
        select: { id: true, name: true },
      });
      const names = new Map(workers.map((w) => [w.id, w.name]));

      return declarations.map((d) => ({
        ...d,
        workerName: names.get(d.workerId) ?? "Unknown",
      }));
    }),

  retry: managerProcedure.input(idSchema).mutation(async ({ ctx, input }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    try {
      return await dimonaService.retryDeclareIn({
        declarationId: input.id,
        businessId,
      });
    } catch (error) {
      mapServiceError(error);
    }
  }),

  declareManual: managerProcedure
    .input(
      z.object({
        shiftId: z.string().min(1),
        workerId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await dimonaService.declareManual({
          shiftId: input.shiftId,
          workerId: input.workerId,
          businessId,
          actorId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  cancel: managerProcedure
    .input(
      z.object({
        shiftId: z.string().min(1),
        workerId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireBusinessId(ctx.session.user.businessId);
      try {
        return await dimonaService.cancel({
          shiftId: input.shiftId,
          workerId: input.workerId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
