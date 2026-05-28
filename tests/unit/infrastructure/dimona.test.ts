import { describe, expect, it } from "vitest";
import { MockDimonaAdapter } from "@/infrastructure/dimona/adapter";
import { decryptString, encryptString } from "@/infrastructure/dimona/crypto";

describe("MockDimonaAdapter", () => {
  it("returns an error when NISS is missing", async () => {
    const a = new MockDimonaAdapter();
    const res = await a.declare({
      workerNiss: "",
      workerType: "FLX",
      employerId: "12345",
      startsAt: new Date(),
      endsAt: new Date(),
      action: "IN",
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("MISSING_NISS");
  });

  it("issues a period id on IN and clears it on OUT", async () => {
    const a = new MockDimonaAdapter();
    const inResult = await a.declare({
      workerNiss: "12.34.56-789.01",
      workerType: "FLX",
      employerId: "98765",
      startsAt: new Date(),
      endsAt: new Date(),
      action: "IN",
    });
    expect(inResult.ok).toBe(true);
    expect(inResult.dimonaPeriodId).toBeTruthy();
    expect(a.__activePeriods()).toHaveLength(1);

    const outResult = await a.declare({
      workerNiss: "12.34.56-789.01",
      workerType: "FLX",
      employerId: "98765",
      startsAt: new Date(),
      endsAt: new Date(),
      action: "OUT",
      dimonaPeriodId: inResult.dimonaPeriodId,
    });
    expect(outResult.ok).toBe(true);
    expect(a.__activePeriods()).toHaveLength(0);
  });

  it("rejects OUT for an unknown period", async () => {
    const a = new MockDimonaAdapter();
    const res = await a.declare({
      workerNiss: "x",
      workerType: "FLX",
      employerId: "1",
      startsAt: new Date(),
      endsAt: new Date(),
      action: "OUT",
      dimonaPeriodId: "missing",
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("UNKNOWN_PERIOD");
  });
});

describe("Dimona credentials encryption", () => {
  it("round-trips a credential payload", () => {
    const payload = JSON.stringify({ user: "test", password: "s3cret" });
    const enc = encryptString(payload);
    expect(enc).not.toContain("s3cret");
    expect(decryptString(enc)).toBe(payload);
  });
});
