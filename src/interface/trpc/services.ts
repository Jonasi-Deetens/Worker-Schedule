import { TRPCError } from "@trpc/server";
import { prisma } from "@/infrastructure/db/prisma";
import { AnalyticsService } from "@/application/services/analytics-service";
import { ApiKeyService } from "@/application/services/api-key-service";
import { AttendanceService } from "@/application/services/attendance-service";
import { AuditService } from "@/application/services/audit-service";
import { AuthService } from "@/application/services/auth-service";
import { AvailabilityService } from "@/application/services/availability-service";
import { BroadcastService } from "@/application/services/broadcast-service";
import { BulkShiftService } from "@/application/services/bulk-shift-service";
import { BusinessService } from "@/application/services/business-service";
import { DocumentService } from "@/application/services/document-service";
import { GdprService } from "@/application/services/gdpr-service";
import { InviteService } from "@/application/services/invite-service";
import { LocationService } from "@/application/services/location-service";
import { MeService } from "@/application/services/me-service";
import { MembershipService } from "@/application/services/membership-service";
import { NotificationService } from "@/application/services/notification-service";
import { RosterService } from "@/application/services/roster-service";
import { ShiftAssignmentService } from "@/application/services/shift-assignment-service";
import { ShiftMessageService } from "@/application/services/shift-message-service";
import { ShiftReadModel } from "@/application/services/shift-read-model";
import { ShiftService } from "@/application/services/shift-service";
import { SkillService } from "@/application/services/skill-service";
import { StaffingSuggestionsService } from "@/application/services/staffing-suggestions-service";
import { SubscriptionService } from "@/application/services/subscription-service";
import { SwapService } from "@/application/services/swap-service";
import { TemplateService } from "@/application/services/template-service";
import { TimeClockService } from "@/application/services/time-clock-service";
import { TimeOffService } from "@/application/services/timeoff-service";
import { TotpAccountService } from "@/application/services/totp-account-service";
import { WebhookService } from "@/application/services/webhook-service";
import { WorkerService } from "@/application/services/worker-service";

/**
 * Singleton service instances shared by every tRPC sub-router. Centralising
 * them here keeps the router files thin (composition only) and ensures each
 * service is instantiated exactly once per process.
 */
export const analyticsService = new AnalyticsService(prisma);
export const apiKeyService = new ApiKeyService(prisma);
export const attendanceService = new AttendanceService(prisma);
export const auditService = new AuditService(prisma);
export const authService = new AuthService(prisma);
export const availabilityService = new AvailabilityService(prisma);
export const broadcastService = new BroadcastService(prisma);
export const bulkShiftService = new BulkShiftService(prisma);
export const businessService = new BusinessService(prisma);
export const documentService = new DocumentService(prisma);
export const gdprService = new GdprService(prisma);
export const inviteService = new InviteService(prisma);
export const locationService = new LocationService(prisma);
export const meService = new MeService(prisma);
export const membershipService = new MembershipService(prisma);
export const notificationService = new NotificationService(prisma);
export const rosterService = new RosterService(prisma);
export const shiftAssignmentService = new ShiftAssignmentService(prisma);
export const shiftMessageService = new ShiftMessageService(prisma);
export const shiftReadModel = new ShiftReadModel(prisma);
export const shiftService = new ShiftService(prisma);
export const skillService = new SkillService(prisma);
export const staffingSuggestionsService = new StaffingSuggestionsService(prisma);
export const subscriptionService = new SubscriptionService(prisma);
export const swapService = new SwapService(prisma);
export const templateService = new TemplateService(prisma);
export const timeClockService = new TimeClockService(prisma);
export const timeOffService = new TimeOffService(prisma);
export const totpAccountService = new TotpAccountService(prisma);
export const webhookService = new WebhookService(prisma);
export const workerService = new WorkerService(prisma);

/** Throws a tRPC FORBIDDEN error if the session has no associated business. */
export function requireBusinessId(businessId: string | null): string {
  if (!businessId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No business associated with user",
    });
  }
  return businessId;
}
