-- Per-user rotation counter for ICS calendar feed token revocation.
ALTER TABLE "users" ADD COLUMN "icsRotation" INTEGER NOT NULL DEFAULT 0;
