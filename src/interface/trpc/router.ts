import { router } from "./init";
import { analyticsRouter } from "./routers/analytics";
import { apiKeyRouter } from "./routers/api-key";
import { attendanceRouter } from "./routers/attendance";
import { auditRouter } from "./routers/audit";
import { authRouter } from "./routers/auth";
import { availabilityRouter } from "./routers/availability";
import { availabilityTemplateRouter } from "./routers/availability-template";
import { businessRouter } from "./routers/business";
import { contractRouter } from "./routers/contract";
import { dimonaRouter } from "./routers/dimona";
import { documentRouter } from "./routers/document";
import { gdprRouter } from "./routers/gdpr";
import { inviteRouter } from "./routers/invite";
import { locationRouter } from "./routers/location";
import { meRouter } from "./routers/me";
import { membershipRouter } from "./routers/membership";
import { notificationRouter } from "./routers/notification";
import { rosterRouter } from "./routers/roster";
import { shiftRouter } from "./routers/shift";
import { shiftMessageRouter } from "./routers/shift-message";
import { skillRouter } from "./routers/skill";
import { staffingRouter } from "./routers/staffing";
import { subscriptionRouter } from "./routers/subscription";
import { swapRouter } from "./routers/swap";
import { templateRouter } from "./routers/template";
import { timeClockRouter } from "./routers/time-clock";
import { timeOffRouter } from "./routers/time-off";
import { twoFactorRouter } from "./routers/two-factor";
import { webhookRouter } from "./routers/webhook";
import { workerRouter } from "./routers/worker";

export const appRouter = router({
  auth: authRouter,
  business: businessRouter,
  shift: shiftRouter,
  availability: availabilityRouter,
  subscription: subscriptionRouter,
  template: templateRouter,
  notification: notificationRouter,
  invite: inviteRouter,
  worker: workerRouter,
  skill: skillRouter,
  timeOff: timeOffRouter,
  availabilityTemplate: availabilityTemplateRouter,
  me: meRouter,
  timeClock: timeClockRouter,
  swap: swapRouter,
  roster: rosterRouter,
  location: locationRouter,
  membership: membershipRouter,
  shiftMessage: shiftMessageRouter,
  document: documentRouter,
  dimona: dimonaRouter,
  contract: contractRouter,
  analytics: analyticsRouter,
  twoFactor: twoFactorRouter,
  gdpr: gdprRouter,
  apiKey: apiKeyRouter,
  webhook: webhookRouter,
  staffing: staffingRouter,
  attendance: attendanceRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
