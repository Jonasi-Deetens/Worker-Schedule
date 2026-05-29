-- Backfill Membership rows for existing users that have a businessId but no
-- corresponding membership. Historically only User.businessId was written, so
-- the memberships table is empty for pre-existing accounts. We mirror the
-- user's role and mark them ACTIVE. gen_random_uuid() supplies the text id
-- (the column is plain TEXT; cuid generation only matters for app-created rows).

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
