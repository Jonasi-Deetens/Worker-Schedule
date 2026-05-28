-- Phase 7 prep: add Dimona employer id on Business and NISS on User.
ALTER TABLE "businesses" ADD COLUMN "dimonaEmployerId" TEXT;
ALTER TABLE "users" ADD COLUMN "nationalNumber" TEXT;
