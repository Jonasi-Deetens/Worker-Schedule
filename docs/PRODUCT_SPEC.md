# Work Calendar — Product Spec

## Vision
A calendar-first staffing app for horeca businesses where flex workers set availability, apply to shifts, and owners approve staffing — with clear status visibility and in-app notifications.

## Problem
Small horeca teams struggle to coordinate flex workers across time blocks. Spreadsheets and chat threads hide who is available, who applied, and what is still open.

## MVP Scope
- Single business tenant (one owner, multiple workers)
- Shift blocks (date + start/end time)
- Worker availability + subscription workflow
- Owner manual approve/reject
- Full-page calendar for both roles
- In-app notifications only
- No payroll/payments (architecture allows future integration)

## User Stories

### Worker
| ID | Story | Priority |
|----|-------|----------|
| W1 | As a worker, I want to see my calendar so I know my schedule at a glance | P0 |
| W2 | As a worker, I want to mark when I am available so owners know my availability | P0 |
| W3 | As a worker, I want to apply to open shifts with one action | P0 |
| W4 | As a worker, I want to withdraw my application before it is approved | P0 |
| W5 | As a worker, I want to see application status (pending/approved/rejected) on the calendar | P0 |
| W6 | As a worker, I want notifications when my application is approved or rejected | P0 |

### Owner
| ID | Story | Priority |
|----|-------|----------|
| O1 | As an owner, I want a staffing calendar showing open, pending, and filled shifts | P0 |
| O2 | As an owner, I want to create shifts with role label and required spots | P0 |
| O3 | As an owner, I want to approve or reject worker applications quickly | P0 |
| O4 | As an owner, I want to be notified when someone applies | P0 |
| O5 | As an owner, I want to edit or cancel shifts | P1 |

## Acceptance Criteria

### Auth
- [ ] Users register/login with email and password
- [ ] Roles: OWNER, WORKER — enforced on routes and API
- [ ] Workers belong to one business; owners manage one business

### Worker Calendar
- [ ] Month/week view with shift blocks color-coded by status
- [ ] Set availability: pick date, start time, end time
- [ ] Apply to open shift in ≤2 clicks from calendar or shift detail
- [ ] Withdraw pending application
- [ ] Status labels: Open, Pending, Approved/Filled, Rejected, Withdrawn, Cancelled

### Owner Calendar
- [ ] Create shift: date, start, end, role label, required spots, optional notes
- [ ] View subscriptions per shift
- [ ] Approve/reject with immediate calendar update
- [ ] Cannot approve beyond required spots
- [ ] Cannot assign overlapping approved shifts to same worker

### Notifications
- [ ] Unread count in header
- [ ] Mark single or all as read
- [ ] Events: new subscription, approval, rejection, withdrawal, cancellation

### Non-Functional
- [ ] Responsive mobile + desktop
- [ ] Keyboard navigable core flows
- [ ] WCAG AA contrast on status colors

## Out of Scope (MVP)
- Email/push notifications
- Payroll, payments, invoicing
- Multi-tenant SaaS billing
- Recurring shift templates
- Shift swap between workers
