-- Real employer identification on Business, used by contract employerSnapshot
-- and Dimona declarations (Phase B left employer address null).

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "addressLine" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "cbeNumber" TEXT;
