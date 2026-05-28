import { publicProcedure, router } from "../init";
import { registerSchema } from "../schemas";
import { authService } from "../services";

export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      return authService.register(input);
    }),
});
