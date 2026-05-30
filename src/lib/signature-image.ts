const MAX_SIGNATURE_BYTES = 200 * 1024;
const MIN_SIGNATURE_BYTES = 50;

/**
 * Parses a data URL or raw base64 PNG from the signature pad.
 */
export function parseSignaturePngBase64(input: string): Uint8Array {
  let raw = input.trim();
  const dataPrefix = /^data:image\/png;base64,/i;
  if (dataPrefix.test(raw)) {
    raw = raw.replace(dataPrefix, "");
  }
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < MIN_SIGNATURE_BYTES) {
    throw new Error("errors.signatureEmpty");
  }
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error("errors.signatureTooLarge");
  }
  const pngHeader = bytes.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngHeader.equals(expected)) {
    throw new Error("errors.signatureInvalid");
  }
  return new Uint8Array(bytes);
}

export async function loadSignaturePngBytes(
  urlOrData: string,
): Promise<Uint8Array> {
  if (urlOrData.startsWith("data:")) {
    return parseSignaturePngBase64(urlOrData);
  }
  const res = await fetch(urlOrData);
  if (!res.ok) {
    throw new Error("Failed to load signature image");
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_SIGNATURE_BYTES) {
    throw new Error("errors.signatureTooLarge");
  }
  return buf;
}
