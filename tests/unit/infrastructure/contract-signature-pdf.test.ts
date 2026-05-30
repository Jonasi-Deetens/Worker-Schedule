import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillContractWithSignatures } from "@/infrastructure/contracts/contract-signature-pdf";
import { CONTRACT_TEMPLATE_FIELDS as F } from "@/infrastructure/contracts/contract-template-fields";

/** Valid 1×1 PNG (embeddable by pdf-lib). */
function validPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

describe("fillContractWithSignatures", () => {
  it("embeds signature images into the NL template", async () => {
    const templatePath = path.join(
      process.cwd(),
      "assets",
      "contracts",
      "student-jobstudent-nl.pdf",
    );
    let templateBytes: Uint8Array;
    try {
      templateBytes = new Uint8Array(await readFile(templatePath));
    } catch {
      return;
    }

    const without = await fillContractWithSignatures({
      templateBytes,
      locale: "nl",
      fieldValues: { [F.signedAt]: "2026-05-30" },
      flatten: true,
    });
    const withSigs = await fillContractWithSignatures({
      templateBytes,
      locale: "nl",
      fieldValues: { [F.signedAt]: "2026-05-30" },
      studentSignaturePng: validPng(),
      employerSignaturePng: validPng(),
      flatten: true,
    });

    expect(withSigs.length).toBeGreaterThan(without.length);
  });
});
