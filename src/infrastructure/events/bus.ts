/**
 * In-process event bus powering the Server-Sent Events endpoint at
 * `/api/events/[businessId]`. Each business gets its own set of subscribers;
 * mutating services call `publish(businessId, event)` so live clients can
 * invalidate their tRPC caches without polling the database.
 *
 * ── Scale-out swap point ──────────────────────────────────────────────────
 * The default {@link InMemoryEventBus} is single-instance: events only reach
 * SSE listeners attached to the *same* Node process. To run multiple instances,
 * implement {@link EventBus} over a fan-out transport (Redis pub/sub, Postgres
 * LISTEN/NOTIFY, etc.) and install it once at boot via {@link setEventBus}.
 * All call sites go through the module-level `subscribe`/`publish` functions,
 * so nothing else needs to change. (We deliberately add no Redis dependency.)
 */
export type BusinessEvent =
  | { type: "shift.updated"; shiftId: string }
  | { type: "subscription.changed"; shiftId: string }
  | { type: "assignment.changed"; shiftId: string }
  | { type: "timeoff.decided"; userId: string }
  | { type: "time_entry.created"; userId: string }
  | { type: "shift.message.created"; shiftId: string }
  | { type: "contract.changed"; userId: string };

type Listener = (event: BusinessEvent) => void;

export interface EventBus {
  subscribe(businessId: string, listener: Listener): () => void;
  publish(businessId: string, event: BusinessEvent): void;
  /** Test/diagnostic helper: number of live listeners for a business. */
  listenerCount(businessId: string): number;
}

export class InMemoryEventBus implements EventBus {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(businessId: string, listener: Listener): () => void {
    let bucket = this.channels.get(businessId);
    if (!bucket) {
      bucket = new Set();
      this.channels.set(businessId, bucket);
    }
    bucket.add(listener);
    return () => {
      bucket?.delete(listener);
      if (bucket && bucket.size === 0) {
        this.channels.delete(businessId);
      }
    };
  }

  publish(businessId: string, event: BusinessEvent): void {
    const bucket = this.channels.get(businessId);
    if (!bucket) return;
    for (const listener of bucket) {
      try {
        listener(event);
      } catch {
        // never let a single misbehaving subscriber break the rest
      }
    }
  }

  listenerCount(businessId: string): number {
    return this.channels.get(businessId)?.size ?? 0;
  }
}

let activeBus: EventBus = new InMemoryEventBus();

/** Swap the bus implementation (e.g. a Redis-backed one) at boot. */
export function setEventBus(bus: EventBus): void {
  activeBus = bus;
}

export function subscribe(businessId: string, listener: Listener): () => void {
  return activeBus.subscribe(businessId, listener);
}

export function publish(businessId: string, event: BusinessEvent): void {
  activeBus.publish(businessId, event);
}

export function __listenerCountForTests(businessId: string): number {
  return activeBus.listenerCount(businessId);
}
