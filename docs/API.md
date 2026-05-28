# API reference — tRPC procedures

Base URL: `/api/trpc`. All responses are JSON. SuperJSON is used as the transformer so `Date` instances round-trip without manual conversion.

Authentication is via NextAuth session cookie. The `createTRPCContext` helper attaches `session.user.id`, `session.user.role`, and `session.user.businessId` to every request.

## `auth`

### `auth.register` (public)
- **Input**: `{ email, password, name, role: 'OWNER' | 'WORKER', businessName?, businessId? }`
- **Output**: `{ userId, businessId }`
- Owners create a new business; workers must provide an existing `businessId` (handed out by the owner after seed/onboarding).

## `business`

### `business.get` (authenticated)
- **Output**: The caller's business including its workers (id, name, email).

## `shift`

### `shift.list` (authenticated)
- **Input**: `{ from: Date, to: Date }`
- **Output**: `Array<Shift & { displayStatus: DisplayStatus, _count, subscriptions?, assignments? }>`
- Workers only see their own subscription per shift.

### `shift.create` (OWNER)
- **Input**: `{ startsAt, endsAt, roleLabel, requiredSpots, notes? }`
- Validates `endsAt > startsAt` and `requiredSpots >= 1`.

### `shift.update` (OWNER)
- **Input**: `{ id } & Partial<createShift>`
- 404 if shift is outside the caller's business.

### `shift.delete` (OWNER)
- **Input**: `{ id }`
- Soft-cancels the shift (status → `CANCELLED`) and notifies pending subscribers.

## `availability`

### `availability.list` (WORKER)
- **Input**: `{ from, to }`

### `availability.set` (WORKER)
- **Input**: `{ startsAt, endsAt }`

### `availability.delete` (WORKER)
- **Input**: `{ id }`

## `subscription`

### `subscription.submit` (WORKER)
- **Input**: `{ shiftId }`
- Creates or reactivates a PENDING subscription. Rejects if the shift is cancelled or the worker already has an active subscription.

### `subscription.withdraw` (WORKER)
- **Input**: `{ subscriptionId }`
- Transitions PENDING → WITHDRAWN. Notifies the business owner.

### `subscription.listForShift` (OWNER)
- **Input**: `{ shiftId }`
- Returns ordered application list with worker details.

### `subscription.approve` (OWNER)
- **Input**: `{ subscriptionId }`
- Transactional: re-checks capacity and overlap, creates a `ShiftAssignment`, marks the subscription APPROVED, flips the shift to FILLED if appropriate, and notifies the worker.

### `subscription.reject` (OWNER)
- **Input**: `{ subscriptionId }`

## `notification`

### `notification.list` (authenticated)
- **Input**: `{ limit? }` (default 50)

### `notification.unreadCount` (authenticated)
- **Output**: `{ count: number }`

### `notification.markRead` (authenticated)
- **Input**: `{ id }`

### `notification.markAllRead` (authenticated)

## Error codes

| tRPC code | When |
|-----------|------|
| `UNAUTHORIZED` | No session attached to the request. |
| `FORBIDDEN` | Role mismatch or cross-business access. |
| `NOT_FOUND` | Entity outside caller's business, or genuinely missing. |
| `CONFLICT` | Capacity exhausted, overlapping assignment, duplicate application. |
| `BAD_REQUEST` | Invalid input or invalid status transition. |
