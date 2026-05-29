import { describe, expect, it } from "vitest";
import {
  calendarEventSurface,
  contrastTextOnBackground,
  mixHexWithWhite,
} from "@/lib/status-colors";

describe("mixHexWithWhite", () => {
  it("lightens a hex color toward white", () => {
    expect(mixHexWithWhite("#000000", 0)).toBe("#ffffff");
    expect(mixHexWithWhite("#000000", 1)).toBe("#000000");
  });
});

describe("contrastTextOnBackground", () => {
  it("returns black on light fills", () => {
    expect(contrastTextOnBackground("#ffffff")).toBe("#000000");
    expect(contrastTextOnBackground("#fde68a")).toBe("#000000");
  });

  it("returns white on dark fills", () => {
    expect(contrastTextOnBackground("#000000")).toBe("#ffffff");
    expect(contrastTextOnBackground("#1d4ed8")).toBe("#ffffff");
  });
});

describe("calendarEventSurface", () => {
  it("uses the accent as the left-edge color and a 10% tint for the fill", () => {
    const open = calendarEventSurface("Open");
    expect(open.accent).toBe("#1d4ed8");
    expect(open.fill).toBe(mixHexWithWhite("#1d4ed8", 0.1));
    expect(open.text).toBe("#000000");
    expect(open.textHover).toBe("#ffffff");
  });

  it("covers availability events", () => {
    const available = calendarEventSurface("Available");
    expect(available.accent).toBe("#7c3aed");
    expect(available.text).toBe("#000000");
  });
});
