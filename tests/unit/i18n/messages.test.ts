import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import fr from "../../../messages/fr.json";

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n message bundles", () => {
  it("English bundle exposes the expected top-level namespaces", () => {
    expect(Object.keys(en)).toEqual(
      expect.arrayContaining([
        "app",
        "auth",
        "calendar",
        "status",
        "shift",
        "availability",
        "notifications",
        "errors",
        "workers",
        "invite",
        "skills",
        "timeOff",
        "profile",
        "hours",
        "clock",
        "rosters",
      ]),
    );
  });

  it("Dutch bundle covers the same keys as the English baseline", () => {
    const enKeys = new Set(flattenKeys(en));
    const nlKeys = new Set(flattenKeys(nl));
    const missing = [...enKeys].filter((k) => !nlKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("French bundle covers the same keys as the English baseline", () => {
    const enKeys = new Set(flattenKeys(en));
    const frKeys = new Set(flattenKeys(fr));
    const missing = [...enKeys].filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("status labels are present in every locale", () => {
    for (const bundle of [en, nl, fr]) {
      expect(bundle.status.open).toBeTruthy();
      expect(bundle.status.pending).toBeTruthy();
    }
  });
});
