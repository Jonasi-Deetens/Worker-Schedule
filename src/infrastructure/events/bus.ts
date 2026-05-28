/**
 * Lightweight in-process event bus used to power the Server-Sent Events
 * endpoint at `/api/events/[businessId]`. Each business gets its own set of
 * subscribers; mutating services call `publish(businessId, event)` so live
 * clients can invalidate their tRPC caches without a database poll.
 *
 * This is per-process. If we ever scale beyond a single Node instance we'll
 * swap the implementation for Redis pub-sub or Postgres LISTEN/NOTIFY without
 * changing the call sites.
 */
export type BusinessEvent =
  | { type: "shift.updated"; shiftId: string }
  | { type: "subscription.changed"; shiftId: string }
  | { type: "assignment.changed"; shiftId: string }
  | { type: "timeoff.decided"; userId: string }
  | { type: "time_entry.created"; userId: string }
  | { type: "shift.message.created"; shiftId: string };

type Listener = (event: BusinessEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribe(businessId: string, listener: Listener): () => void {
  let bucket = channels.get(businessId);
  if (!bucket) {
    bucket = new Set();
    channels.set(businessId, bucket);
  }
  bucket.add(listener);
  return () => {
    bucket?.delete(listener);
    if (bucket && bucket.size === 0) {
      channels.delete(businessId);
    }
  };
}

export function publish(businessId: string, event: BusinessEvent): void {
  const bucket = channels.get(businessId);
  if (!bucket) return;
  for (const listener of bucket) {
    try {
      listener(event);
    } catch {
      // never let a single misbehaving subscriber break the rest
    }
  }
}

export function __listenerCountForTests(businessId: string): number {
  return channels.get(businessId)?.size ?? 0;
}
