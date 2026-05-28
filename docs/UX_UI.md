# UX / UI specification

## Screen inventory

| Screen | Route | Role | Primary actions |
|--------|-------|------|-----------------|
| Login | `/login` | Public | Email/password sign in |
| Register | `/register` | Public | Create owner or worker account |
| Calendar | `/calendar` | Both | Full-page FullCalendar with month/week/day switching |
| Notifications | `/notifications` | Both | Read and dismiss in-app notifications |

Owners and workers share the same calendar route; the page reads `session.user.role` and renders the appropriate toolbar action ("New shift" vs "Set availability") and event semantics.

## Interaction rules

### Worker
1. Lands on the calendar (server-side redirected from `/`).
2. Clicks "Set availability" → compact dialog (date + start/end) → save → availability block appears in violet.
3. Clicks any open shift event → shift detail sheet → "Apply for shift" (single click).
4. While pending, the worker can withdraw from the same sheet.
5. Calendar reflects subscription status per shift (Pending / Approved / Rejected / Withdrawn).

### Owner
1. Lands on the staffing calendar.
2. Clicks "New shift" → compact dialog → save → shift appears with `(filled/required)` subtitle.
3. Clicks a shift event → shift detail sheet → reviews applications inline with Approve / Reject buttons.
4. Can cancel a shift from the same sheet; pending subscribers are notified.

Both flows reach the core action in at most two clicks from the calendar.

## Status colors

| Status | FullCalendar background | Badge label |
|--------|------------------------|-------------|
| Open | `#3b82f6` (blue) | Open |
| Pending | `#f59e0b` (amber) | Pending |
| Approved / Filled | `#16a34a` (green) | Approved |
| Rejected | `#ef4444` (red) | Rejected |
| Withdrawn | `#94a3b8` (slate) | Withdrawn |
| Cancelled | `#9ca3af` (gray) | Cancelled |
| Availability | `#ede9fe` bg, `#a78bfa` border | Available |

Status is always announced via text and a `sr-only` label inside each event so colour is never the sole signal.

## Component list

| Component | Path | Responsibility |
|-----------|------|----------------|
| `WorkCalendar` | `src/interface/components/work-calendar.tsx` | FullCalendar wrapper with month/week/day views and event dispatch |
| `ShiftDetailDialog` | `src/interface/components/shift-detail-dialog.tsx` | Role-aware actions on a shift event |
| `ShiftFormDialog` | `src/interface/components/shift-form-dialog.tsx` | Owner create shift |
| `AvailabilityFormDialog` | same file | Worker create availability block |
| `StatusBadge` | `src/interface/components/status-badge.tsx` | Reusable status pill |
| `AppHeader` | `src/interface/components/app-header.tsx` | Branding, role badge, notification bell, sign out |
| `Button`, `Input`, `Label` | `src/interface/components/ui/` | shadcn-style primitives |

## Accessibility checklist

- [x] Semantic landmarks (`header`, `main`, `role="region"` on the calendar).
- [x] All interactive elements reachable via Tab; Escape closes Radix dialogs.
- [x] Focus rings (`focus-visible:ring-2 ring-offset-2`) on every primitive.
- [x] Form fields paired with `<Label>` via `htmlFor`.
- [x] Error messages use `role="alert"`.
- [x] Status conveyed by text (badge label + sr-only inside calendar events), never by colour alone.
- [x] Notification bell `aria-label` includes the unread count.
- [x] `prefers-reduced-motion` honoured in the global stylesheet.
- [ ] Full keyboard arrow-grid navigation inside the calendar (deferred — FullCalendar's default keyboard support is functional but not full WAI-ARIA grid).

## Responsive behaviour

- Calendar height auto-grows on desktop; week/day views fit smaller screens.
- Header collapses the role badge and user name on `xs` viewports.
- Dialogs use `w-[calc(100%-2rem)]` so they remain usable on mobile.
