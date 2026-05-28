# TDD Vertical Slices — Commit Suggestions

## Slice 1: Domain rules
- **Tests**: `tests/unit/domain/scheduling.test.ts`
- **Implementation**: `src/domain/rules/scheduling.ts`, `src/domain/types.ts`
- **Commit**: `feat(domain): add scheduling rules with overlap and capacity tests`

## Slice 2: Database schema
- **Tests**: schema validation via Prisma generate
- **Implementation**: `prisma/schema.prisma`, `prisma/migrations/`
- **Commit**: `feat(db): add PostgreSQL schema for shifts, subscriptions, notifications`

## Slice 3: Application services
- **Tests**: `tests/integration/subscription-flow.test.ts`
- **Implementation**: `src/application/services/*`
- **Commit**: `feat(services): implement shift, subscription, availability, notification services`

## Slice 4: Auth + tRPC API
- **Implementation**: `src/infrastructure/auth/`, `src/interface/trpc/`
- **Commit**: `feat(api): add tRPC routers with role-based auth guards`

## Slice 5: Calendar UI
- **Implementation**: `src/interface/components/`, `src/app/calendar/`
- **Commit**: `feat(ui): add calendar-first owner and worker experiences`

## Slice 6: Notifications + E2E
- **Tests**: `tests/e2e/calendar-flow.spec.ts`
- **Implementation**: `src/app/notifications/`, CI workflow
- **Commit**: `feat(notifications): in-app inbox and Playwright e2e flows`
