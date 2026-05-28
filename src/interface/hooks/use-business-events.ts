"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

type Handler = (event: string, payload: unknown) => void;

/**
 * Subscribes to the SSE stream for the current business and forwards each
 * event to `onEvent`. Reconnects automatically through the browser's
 * EventSource implementation. No-ops on the server and when no business is
 * attached to the session.
 */
export function useBusinessEvents(onEvent: Handler): void {
  const { data: session } = useSession();
  const businessId = session?.user.businessId ?? null;

  useEffect(() => {
    if (!businessId || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const source = new EventSource(`/api/events/${businessId}`);

    const events = [
      "shift.updated",
      "subscription.changed",
      "assignment.changed",
      "timeoff.decided",
      "time_entry.created",
    ];

    const handlers = events.map((name) => {
      const handler = (e: MessageEvent) => {
        let payload: unknown = undefined;
        try {
          payload = JSON.parse(e.data);
        } catch {
          payload = e.data;
        }
        onEvent(name, payload);
      };
      source.addEventListener(name, handler as EventListener);
      return [name, handler] as const;
    });

    return () => {
      for (const [name, handler] of handlers) {
        source.removeEventListener(name, handler as EventListener);
      }
      source.close();
    };
  }, [businessId, onEvent]);
}
