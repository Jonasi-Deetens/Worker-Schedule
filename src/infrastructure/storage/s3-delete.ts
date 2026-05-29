/**
 * Hand-rolled AWS Signature V4 presigner + DELETE for S3-compatible object
 * removal, used by the GDPR purge job to erase a user's uploaded documents.
 *
 * We deliberately avoid the AWS SDK (matching {@link presignS3Put}) and only
 * cover the narrow case we need: presign a single-object DELETE and issue it
 * with `fetch`. Works against AWS S3, Cloudflare R2, and MinIO (path style).
 */
import { createHash, createHmac } from "crypto";

const ALGO = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

export interface DeleteSignInput {
  endpoint: string;
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds the URL stays valid for (max 7 days per spec). */
  expiresInSeconds?: number;
  forcePathStyle?: boolean;
  /** Test seam for clock injection. */
  now?: () => Date;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function dateStamp(d: Date): string {
  return amzDate(d).slice(0, 8);
}
function uriEncode(s: string, encodeSlash = true): string {
  return s
    .split("")
    .map((c) => {
      if (/[A-Za-z0-9_.\-~]/.test(c)) return c;
      if (c === "/" && !encodeSlash) return c;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

/** Builds a presigned DELETE URL for a single object. */
export function presignS3Delete(input: DeleteSignInput): string {
  const now = input.now ? input.now() : new Date();
  const amz = amzDate(now);
  const stamp = dateStamp(now);
  const expires = input.expiresInSeconds ?? 600;

  const endpoint = new URL(input.endpoint);
  const host = input.forcePathStyle
    ? endpoint.host
    : `${input.bucket}.${endpoint.host}`;
  const path = input.forcePathStyle
    ? `/${input.bucket}/${uriEncode(input.key, false)}`
    : `/${uriEncode(input.key, false)}`;

  const credentialScope = `${stamp}/${input.region}/${SERVICE}/aws4_request`;
  const signedHeaders = "host";

  const params: Record<string, string> = {
    "X-Amz-Algorithm": ALGO,
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k]!)}`)
    .join("&");

  const canonicalRequest = [
    "DELETE",
    path,
    canonicalQuery,
    `host:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [ALGO, amz, credentialScope, sha256(canonicalRequest)].join(
    "\n",
  );

  const kDate = hmac("AWS4" + input.secretAccessKey, stamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return `${endpoint.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Derives the object key from a stored object URL given the storage config.
 * Returns null when the URL doesn't belong to the configured bucket/endpoint.
 */
export function objectKeyFromUrl(
  rawUrl: string,
  config: { bucket: string; forcePathStyle?: boolean },
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  let path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (config.forcePathStyle) {
    const prefix = `${config.bucket}/`;
    if (!path.startsWith(prefix)) return null;
    path = path.slice(prefix.length);
  }
  return path.length > 0 ? path : null;
}

/**
 * Issues a signed DELETE for a single object. Returns true on a 2xx (or 404,
 * treated as already-gone). `fetcher` is injectable so tests never hit network.
 */
export async function deleteObject(
  input: DeleteSignInput,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const url = presignS3Delete(input);
  const res = await fetcher(url, { method: "DELETE" });
  return res.ok || res.status === 404;
}
