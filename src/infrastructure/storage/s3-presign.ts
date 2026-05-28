/**
 * Hand-rolled AWS Signature V4 presigner for S3-compatible PUT uploads.
 *
 * We deliberately avoid the AWS SDK to keep the bundle small and the runtime
 * portable (Workers, Lambda, plain Node). The implementation covers the
 * narrow case we actually need: a single-object PUT, with an optional
 * Content-Type and a fixed expiry.
 *
 * Works against AWS S3, Cloudflare R2, MinIO, and Backblaze B2. For R2 the
 * region is always `auto`; for MinIO set `forcePathStyle: true`.
 */
import { createHash, createHmac } from "crypto";

const ALGO = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

export interface PresignInput {
  endpoint: string; // e.g. https://s3.eu-west-1.amazonaws.com or https://<acct>.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds the URL stays valid for (max 7 days per spec). */
  expiresInSeconds: number;
  contentType?: string;
  /** MinIO and older S3 setups need `https://host/bucket/key` instead of vhost style. */
  forcePathStyle?: boolean;
  /** Test seam for clock injection. */
  now?: () => Date;
}

export interface PresignedPut {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
function amzDate(d: Date): string {
  // 20230101T000000Z
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

/**
 * Builds a presigned PUT URL suitable for direct browser upload. The browser
 * must send the same `Content-Type` header in its PUT for the signature to
 * verify against AWS / R2.
 */
export function presignS3Put(input: PresignInput): PresignedPut {
  const now = input.now ? input.now() : new Date();
  const amz = amzDate(now);
  const stamp = dateStamp(now);

  const endpoint = new URL(input.endpoint);
  // S3 virtual-host style places the bucket in the hostname; path style keeps
  // it in the URL path. MinIO and IP-based dev endpoints only support path.
  const host = input.forcePathStyle
    ? endpoint.host
    : `${input.bucket}.${endpoint.host}`;
  const path = input.forcePathStyle
    ? `/${input.bucket}/${uriEncode(input.key, false)}`
    : `/${uriEncode(input.key, false)}`;

  const credentialScope = `${stamp}/${input.region}/${SERVICE}/aws4_request`;
  const signedHeaders = input.contentType ? "content-type;host" : "host";

  const params: Record<string, string> = {
    "X-Amz-Algorithm": ALGO,
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k]!)}`)
    .join("&");

  const canonicalHeaders = input.contentType
    ? `content-type:${input.contentType}\nhost:${host}\n`
    : `host:${host}\n`;

  const canonicalRequest = [
    "PUT",
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGO,
    amz,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + input.secretAccessKey, stamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const url = `${endpoint.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const headers: Record<string, string> = { Host: host };
  if (input.contentType) headers["Content-Type"] = input.contentType;

  return {
    url,
    headers,
    expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000)
      .toISOString(),
  };
}
