-- Re-run the Membership backfill so accounts created after the original
-- backfill (20260529020000) — notably the demo workers from `prisma/seed.ts`,
-- which only ever wrote User.businessId — get a matching membership row. Now
-- that scheduling gates on an active membership, a business with only legacy
-- businessId links would have no assignable workers at all.
--
-- Idempotent: only inserts where a membership for that (user, business) pair is
-- missing, so it is safe to run on top of the earlier backfill.

INSERT INTO "memberships" ("id", "userId", "businessId", "role", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."businessId",
  u."role",
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
WHERE u."businessId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "memberships" m
    WHERE m."userId" = u."id"
      AND m."businessId" = u."businessId"
  );
