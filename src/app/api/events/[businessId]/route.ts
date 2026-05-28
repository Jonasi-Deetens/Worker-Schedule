import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { subscribe } from "@/infrastructure/events/bus";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of `BusinessEvent`s scoped to the caller's
 * business. Used by the web client to invalidate the relevant tRPC queries.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { businessId } = await context.params;
  if (session.user.businessId !== businessId) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));
      const unsubscribe = subscribe(businessId, (event) => {
        const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controller already closed; subscribers will be cleaned up below
        }
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          // ignore
        }
      }, 25_000);

      const close = () => {
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // Pull in AbortSignal if available
      (controller as unknown as { signal?: AbortSignal }).signal?.addEventListener(
        "abort",
        close,
      );

      // When the client disconnects the stream is automatically cancelled.
      // We expose `close` for tests via internal usage.
      Object.assign(controller, { __close: close });
    },
    cancel() {
      // Nothing extra to do; the start() teardown handles it via abort.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
