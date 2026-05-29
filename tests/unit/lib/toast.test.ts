import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

import { toast as sonnerToast } from "sonner";
import { toast, trpcErrorMessage } from "@/lib/toast";

describe("toast wrapper", () => {
  it("delegates success to sonner", () => {
    toast.success("Saved", { description: "ok" });
    expect(sonnerToast.success).toHaveBeenCalledWith("Saved", {
      description: "ok",
    });
  });

  it("delegates error to sonner", () => {
    toast.error("Boom");
    expect(sonnerToast.error).toHaveBeenCalledWith("Boom", undefined);
  });
});

describe("trpcErrorMessage", () => {
  const t = (key: string) => key;

  it("maps capacity errors", () => {
    expect(trpcErrorMessage({ message: "capacity exceeded" }, t)).toBe(
      "errors.capacityFull",
    );
  });

  it("maps overlap errors", () => {
    expect(trpcErrorMessage({ message: "overlap detected" }, t)).toBe(
      "errors.overlap",
    );
  });

  it("maps duplicate application errors", () => {
    expect(
      trpcErrorMessage({ message: "Already applied to this shift" }, t),
    ).toBe("errors.duplicateApplication");
  });

  it("falls back to generic for unknown errors", () => {
    expect(trpcErrorMessage({ message: "totally novel error" }, t)).toBe(
      "errors.generic",
    );
    expect(trpcErrorMessage(null, t)).toBe("errors.generic");
  });

  it("maps the extended error families", () => {
    expect(trpcErrorMessage({ message: "Forbidden" }, t)).toBe("errors.forbidden");
    expect(trpcErrorMessage({ message: "User not found" }, t)).toBe("errors.notFound");
    expect(trpcErrorMessage({ message: "Rate limit exceeded" }, t)).toBe("errors.rateLimit");
    expect(trpcErrorMessage({ message: "Invalid input" }, t)).toBe("errors.invalidInput");
    expect(trpcErrorMessage({ message: "Dimona declaration failed" }, t)).toBe("errors.dimona");
    expect(trpcErrorMessage({ message: "fetch failed" }, t)).toBe("errors.network");
    expect(trpcErrorMessage({ message: "Past shift" }, t)).toBe("errors.pastShift");
    expect(trpcErrorMessage({ message: "Approved time-off in range" }, t)).toBe("errors.timeOffConflict");
  });

  it("maps the availability-in-time-off router error to its own key", () => {
    expect(
      trpcErrorMessage({ message: "errors.availabilityInTimeOff" }, t),
    ).toBe("errors.availabilityInTimeOff");
  });

  it("passes through stable error keys without regex matching", () => {
    // New keyed errors localize directly via the key, not the English regex.
    expect(trpcErrorMessage({ message: "errors.resetTokenInvalid" }, t)).toBe(
      "errors.resetTokenInvalid",
    );
    expect(
      trpcErrorMessage({ message: "errors.attendanceNoShowHasEntry" }, t),
    ).toBe("errors.attendanceNoShowHasEntry");
    expect(trpcErrorMessage({ message: "errors.weakPassword" }, t)).toBe(
      "errors.weakPassword",
    );
  });
});
