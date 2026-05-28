-- AlterTable: add recurrence and template fields to shifts
ALTER TABLE "shifts" ADD COLUMN "recurrenceRule" TEXT,
                    ADD COLUMN "templateId" TEXT;

-- CreateTable: ShiftTemplate
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "requiredSpots" INTEGER NOT NULL DEFAULT 1,
    "defaultStart" TEXT NOT NULL,
    "defaultEnd" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_templates_businessId_idx" ON "shift_templates"("businessId");

-- CreateIndex
CREATE INDEX "shifts_templateId_idx" ON "shifts"("templateId");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "shift_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
