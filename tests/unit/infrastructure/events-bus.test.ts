import { describe, expect, it, vi } from "vitest";
import {
  __listenerCountForTests,
  publish,
  subscribe,
} from "@/infrastructure/events/bus";

describe("event bus", () => {
  it("delivers events only to subscribers of the same business", () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const unA = subscribe("biz-a", onA);
    const unB = subscribe("biz-b", onB);

    publish("biz-a", { type: "shift.updated", shiftId: "s1" });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();

    unA();
    unB();
    expect(__listenerCountForTests("biz-a")).toBe(0);
    expect(__listenerCountForTests("biz-b")).toBe(0);
  });

  it("does not throw when a listener errors", () => {
    const ok = vi.fn();
    subscribe("biz-c", () => {
      throw new Error("boom");
    });
    subscribe("biz-c", ok);
    expect(() =>
      publish("biz-c", { type: "shift.updated", shiftId: "s2" }),
    ).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });

  it("returns 0 listeners for unknown channels", () => {
    expect(__listenerCountForTests("nope")).toBe(0);
  });
});
