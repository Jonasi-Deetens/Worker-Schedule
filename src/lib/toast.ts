import { toast as sonnerToast } from "sonner";

/**
 * Thin wrapper around the toast library. Keeps callers framework-agnostic so we
 * can swap the implementation without touching feature code.
 */
export const toast = {
  success(message: string, options?: { description?: string }) {
    sonnerToast.success(message, options);
  },
  error(message: string, options?: { description?: string }) {
    sonnerToast.error(message, options);
  },
  info(message: string, options?: { description?: string }) {
    sonnerToast.message(message, options);
  },
};

/**
 * Patterns that map a thrown server `Error.message` to an `errors.*`
 * translation key. Order matters — the first matching entry wins, so put
 * narrower phrases before broader ones.
 *
 * Pattern values are matched case-insensitively. Update the EN/NL/FR JSON
 * files in lock-step when adding a new key.
 */
const ERROR_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/(at capacity|capacity full|already filled|capacity)/i, "errors.capacityFull"],
  [/overlap/i, "errors.overlap"],
  [/(already applied|duplicate application)/i, "errors.duplicateApplication"],
  [/(shift\s+(was\s+)?cancelled|cannot.*cancelled)/i, "errors.shiftCancelled"],
  [/end time.*(after|before)/i, "errors.endBeforeStart"],
  [/time[- ]?off/i, "errors.timeOffConflict"],
  [/(11\s?h|min(imum)?\s+rest|rest period)/i, "errors.minRest"],
  [/(weekly|cap|hour cap)/i, "errors.weeklyCap"],
  [/(too young|age restricted|under \d+)/i, "errors.ageRestricted"],
  [/(unauthorized|unauthorised|forbidden|permission)/i, "errors.forbidden"],
  [/(not found|missing|unknown.*id)/i, "errors.notFound"],
  [/(rate limit|too many requests)/i, "errors.rateLimit"],
  [/(invalid (input|body|argument|password))/i, "errors.invalidInput"],
  [/dimona/i, "errors.dimona"],
  [/(network|fetch failed|econnreset|timeout)/i, "errors.network"],
  [/(past shift|already ended|before the shift)/i, "errors.pastShift"],
];

/**
 * Map a tRPC client error to a user-facing, localised message. The `t`
 * callback is anything-shaped — we just need `(key) => string`, which is
 * compatible with next-intl's stricter overloaded signature at call sites.
 */
export function trpcErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message) {
      for (const [pattern, key] of ERROR_MAP) {
        if (pattern.test(message)) return t(key);
      }
    }
  }
  return t("errors.generic");
}
