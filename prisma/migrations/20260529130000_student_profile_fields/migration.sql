-- Student-worker profile fields + Belgian region enum

CREATE TYPE "StudentRegion" AS ENUM ('FLANDERS', 'BRUSSELS', 'WALLONIA', 'EAST_BELGIUM');

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "addressLine" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "iban" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "region" "StudentRegion";
