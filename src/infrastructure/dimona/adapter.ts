/**
 * Belgian Dimona ("Déclaration Immédiate / Onmiddellijke Aangifte") adapter.
 *
 * The real Dimona service is a SOAP/REST endpoint provided by Belgian Social
 * Security (https://www.socialsecurity.be/). For testability and to enable
 * sandbox deployments without credentials, this module exposes a small
 * `DimonaAdapter` interface plus an in-memory `MockDimonaAdapter` that
 * imitates the relevant happy/error paths.
 *
 * The production adapter (not implemented here) hits the real endpoint and
 * exchanges credentials for a session token. Switching is a single env-var
 * flip at the call site.
 */

import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export type DimonaAction = "IN" | "OUT" | "CANCEL";

export interface DimonaDeclarationInput {
  workerNiss: string; // Belgian national number ("Rijksregister")
  workerType: "FLX" | "STU" | "OTH" | "EXT";
  startsAt: Date;
  endsAt: Date;
  employerId: string; // ONSS / RSZ number
  action: DimonaAction;
  /** Optional id linking back to an existing declaration for OUT/CANCEL. */
  dimonaPeriodId?: string;
  /**
   * STU (student) declarations are filed per calendar quarter with the total
   * planned hours for that quarter. These are set only for `workerType: "STU"`.
   */
  plannedHours?: number;
  quarter?: number;
  year?: number;
}

export interface DimonaDeclarationResult {
  ok: boolean;
  dimonaPeriodId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}

export interface DimonaAdapter {
  declare(input: DimonaDeclarationInput): Promise<DimonaDeclarationResult>;
}

/**
 * In-memory mock adapter for tests and dev. Echoes a synthetic period id back
 * for `IN` actions and accepts the corresponding period id for OUT/CANCEL.
 * Returns a structured error when the NISS is missing.
 */
export class MockDimonaAdapter implements DimonaAdapter {
  private seq = 0;
  private active = new Map<string, DimonaDeclarationInput>();

  async declare(input: DimonaDeclarationInput): Promise<DimonaDeclarationResult> {
    if (!input.workerNiss) {
      return {
        ok: false,
        errorCode: "MISSING_NISS",
        errorMessage: "Worker NISS is required",
      };
    }
    if (input.action === "IN") {
      this.seq += 1;
      const id = `DIM-${input.employerId}-${this.seq}`;
      this.active.set(id, input);
      return { ok: true, dimonaPeriodId: id };
    }
    if (input.action === "OUT" || input.action === "CANCEL") {
      if (!input.dimonaPeriodId || !this.active.has(input.dimonaPeriodId)) {
        return {
          ok: false,
          errorCode: "UNKNOWN_PERIOD",
          errorMessage: "Unknown Dimona period",
        };
      }
      this.active.delete(input.dimonaPeriodId);
      return { ok: true, dimonaPeriodId: input.dimonaPeriodId };
    }
    return { ok: false, errorCode: "UNSUPPORTED_ACTION" };
  }

  /** Test-only accessor: returns the in-memory active period ids. */
  __activePeriods(): string[] {
    return [...this.active.keys()];
  }
}

type Fetcher = typeof fetch;

interface HttpAdapterOptions {
  /** Base URL like `https://services-acpt.socialsecurity.be/REST/dimona/v1` */
  baseUrl: string;
  /** Bearer token for the ONSS REST endpoint. */
  token: string;
  /** Network timeout in ms; defaults to 15 s. */
  timeoutMs?: number;
  /** Injected for tests. */
  fetcher?: Fetcher;
}

/**
 * Real Dimona REST adapter (ONSS / RSZ). Sends a single JSON declaration per
 * call. The actual ONSS endpoint requires mTLS with an X.509 client
 * certificate provided by the employer; provisioning that certificate happens
 * outside this code (deployment-time TLS configuration on the Node runtime
 * or a sidecar). This adapter is intentionally pure HTTP so it can be wired
 * to a custom dispatcher that adds the mTLS material.
 *
 * Error mapping is conservative: any 4xx with a JSON `errorCode` is surfaced
 * verbatim; any other failure becomes `HTTP_<status>` or `NETWORK_ERROR` so
 * the caller can decide whether to retry.
 */
export class HttpDimonaAdapter implements DimonaAdapter {
  private readonly fetcher: Fetcher;
  constructor(private readonly opts: HttpAdapterOptions) {
    this.fetcher = opts.fetcher ?? fetch;
  }

  async declare(
    input: DimonaDeclarationInput,
  ): Promise<DimonaDeclarationResult> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/declarations`;
    const body = {
      employerId: input.employerId,
      worker: { niss: input.workerNiss, type: input.workerType },
      action: input.action,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      ...(input.dimonaPeriodId ? { dimonaPeriodId: input.dimonaPeriodId } : {}),
      ...(input.plannedHours !== undefined
        ? { plannedHours: input.plannedHours }
        : {}),
      ...(input.quarter !== undefined ? { quarter: input.quarter } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? 15_000,
    );
    try {
      const res = await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // pass — non-JSON body
      }
      if (!res.ok) {
        const err = parsed as { errorCode?: string; message?: string } | null;
        return {
          ok: false,
          errorCode: err?.errorCode ?? `HTTP_${res.status}`,
          errorMessage: err?.message ?? `Dimona request failed (${res.status})`,
          raw: parsed,
        };
      }
      const data = parsed as { dimonaPeriodId?: string } | null;
      return {
        ok: true,
        dimonaPeriodId: data?.dimonaPeriodId ?? input.dimonaPeriodId,
        raw: parsed,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Result of an OAuth2 client-credentials token exchange we keep cached.
 */
interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

interface RszAdapterOptions {
  /** RSZ REST v2 base, e.g. `https://services.socialsecurity.be/REST/dimona/v2`. */
  baseUrl: string;
  /** OAuth2 token endpoint, e.g. `.../REST/oauth/v5/token`. */
  oauthUrl: string;
  /** OAuth2 client id registered in the RSZ Chaman portal. */
  clientId: string;
  /** PEM-encoded X.509 private key used to sign the client assertion JWT. */
  privateKeyPem: string;
  /** Space-separated OAuth2 scopes (defaults to the Dimona scope). */
  scope?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
  /** Injectable clock for deterministic token-expiry tests. */
  now?: () => number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Direct RSZ REST v2 Dimona adapter. Authenticates with OAuth2
 * client-credentials using a `private_key_jwt` client assertion signed by the
 * employer's X.509 private key (configured in the RSZ Chaman portal), caches
 * the bearer token until shortly before expiry, then POSTs declarations.
 *
 * Pure Node built-ins (`crypto`, `fetch`) — no Dimona SDK. All network is
 * defensive: bounded timeouts and structured error mapping so failures are
 * retryable rather than thrown.
 */
export class RszRestDimonaAdapter implements DimonaAdapter {
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private cached: CachedToken | null = null;

  constructor(private readonly opts: RszAdapterOptions) {
    this.fetcher = opts.fetcher ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  /** Builds a short-lived RS256 JWT proving control of the X.509 private key. */
  private buildClientAssertion(): string {
    const iat = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
      JSON.stringify({
        iss: this.opts.clientId,
        sub: this.opts.clientId,
        aud: this.opts.oauthUrl,
        jti: randomUUID(),
        iat,
        exp: iat + 60,
      }),
    );
    const signingInput = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(this.opts.privateKeyPem);
    return `${signingInput}.${base64url(signature)}`;
  }

  private async getToken(): Promise<
    { ok: true; token: string } | { ok: false; result: DimonaDeclarationResult }
  > {
    if (this.cached && this.cached.expiresAtMs > this.now() + 30_000) {
      return { ok: true, token: this.cached.accessToken };
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? 15_000,
    );
    try {
      const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: this.buildClientAssertion(),
        scope: this.opts.scope ?? "scope:dimona",
      });
      const res = await this.fetcher(this.opts.oauthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // non-JSON body
      }
      if (!res.ok) {
        const err = parsed as { error?: string; error_description?: string } | null;
        return {
          ok: false,
          result: {
            ok: false,
            errorCode: err?.error ?? `OAUTH_HTTP_${res.status}`,
            errorMessage:
              err?.error_description ?? `OAuth token request failed (${res.status})`,
            raw: parsed,
          },
        };
      }
      const data = parsed as { access_token?: string; expires_in?: number } | null;
      if (!data?.access_token) {
        return {
          ok: false,
          result: {
            ok: false,
            errorCode: "OAUTH_NO_TOKEN",
            errorMessage: "OAuth response did not include an access_token",
            raw: parsed,
          },
        };
      }
      this.cached = {
        accessToken: data.access_token,
        expiresAtMs: this.now() + (data.expires_in ?? 300) * 1000,
      };
      return { ok: true, token: data.access_token };
    } catch (err) {
      return {
        ok: false,
        result: {
          ok: false,
          errorCode: "NETWORK_ERROR",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async declare(
    input: DimonaDeclarationInput,
  ): Promise<DimonaDeclarationResult> {
    const token = await this.getToken();
    if (!token.ok) return token.result;

    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/declarations`;
    const body = {
      employerId: input.employerId,
      worker: { niss: input.workerNiss, type: input.workerType },
      action: input.action,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      ...(input.dimonaPeriodId ? { dimonaPeriodId: input.dimonaPeriodId } : {}),
      ...(input.plannedHours !== undefined
        ? { plannedHours: input.plannedHours }
        : {}),
      ...(input.quarter !== undefined ? { quarter: input.quarter } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? 15_000,
    );
    try {
      const res = await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // non-JSON body
      }
      if (!res.ok) {
        const err = parsed as { errorCode?: string; message?: string } | null;
        return {
          ok: false,
          errorCode: err?.errorCode ?? `HTTP_${res.status}`,
          errorMessage: err?.message ?? `Dimona request failed (${res.status})`,
          raw: parsed,
        };
      }
      const data = parsed as { dimonaPeriodId?: string } | null;
      return {
        ok: true,
        dimonaPeriodId: data?.dimonaPeriodId ?? input.dimonaPeriodId,
        raw: parsed,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export type SocialSecretariatProvider =
  | "securex"
  | "sdworx"
  | "partena"
  | "liantis";

/**
 * Provider seam for filing Dimona through a social secretariat (Securex, SD
 * Worx, Partena, Liantis) under a DmFa mandate — the route most Belgian firms
 * use instead of talking to RSZ directly.
 *
 * This is a deliberate stub: each provider exposes a different API/file format,
 * so until provider credentials and the provider-specific transport are wired
 * in, every declaration returns a safe `NOT_CONFIGURED` result (never throws,
 * never silently "succeeds").
 */
export class SocialSecretariatDimonaAdapter implements DimonaAdapter {
  constructor(private readonly opts: { provider: SocialSecretariatProvider }) {}

  async declare(): Promise<DimonaDeclarationResult> {
    // TODO: configure your provider credentials and implement the
    // provider-specific transport (REST API or batch file) for
    // `${this.opts.provider}`. Each social secretariat differs; wire the
    // mandate + credentials here, then map their response to DimonaDeclarationResult.
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      errorMessage: `Social secretariat provider "${this.opts.provider}" is selected but not configured. Add provider credentials to enable Dimona filing.`,
    };
  }
}

let registered: DimonaAdapter | null = null;

/** Reads a PEM private key from env (inline value, or a path that wins). */
function loadRszPrivateKey(): string | null {
  const path = process.env.DIMONA_REST_PRIVATE_KEY_PATH;
  if (path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  }
  return process.env.DIMONA_REST_PRIVATE_KEY ?? null;
}

/**
 * Returns the adapter selected by environment, in priority order:
 *
 * 1. `DIMONA_PROVIDER` set → `SocialSecretariatDimonaAdapter` (provider stub).
 * 2. `DIMONA_ENV=prod|simulation` + RSZ REST creds present →
 *    `RszRestDimonaAdapter` (OAuth2 + X.509 against `DIMONA_REST_BASE_URL`).
 * 3. `DIMONA_ENV=prod|sandbox` + `DIMONA_TOKEN` + URL → `HttpDimonaAdapter`.
 * 4. Anything else (including unset / missing config) → `MockDimonaAdapter`.
 *
 * The returned adapter is cached process-wide; call
 * `__setDimonaAdapterForTests(null)` to clear in tests.
 */
export function getDimonaAdapter(): DimonaAdapter {
  if (registered) return registered;
  const env = process.env.DIMONA_ENV;

  const provider = process.env.DIMONA_PROVIDER as
    | SocialSecretariatProvider
    | undefined;
  if (provider) {
    registered = new SocialSecretariatDimonaAdapter({ provider });
    return registered;
  }

  if (env === "prod" || env === "simulation") {
    const baseUrl = process.env.DIMONA_REST_BASE_URL;
    const oauthUrl = process.env.DIMONA_OAUTH_URL;
    const clientId = process.env.DIMONA_REST_CLIENT_ID;
    const privateKeyPem = loadRszPrivateKey();
    if (baseUrl && oauthUrl && clientId && privateKeyPem) {
      registered = new RszRestDimonaAdapter({
        baseUrl,
        oauthUrl,
        clientId,
        privateKeyPem,
      });
      return registered;
    }
  }

  if (env === "prod" || env === "sandbox") {
    const baseUrl =
      env === "prod"
        ? process.env.DIMONA_PROD_URL
        : process.env.DIMONA_SANDBOX_URL;
    const token = process.env.DIMONA_TOKEN;
    if (baseUrl && token) {
      registered = new HttpDimonaAdapter({ baseUrl, token });
      return registered;
    }
  }

  registered = new MockDimonaAdapter();
  return registered;
}

export function __setDimonaAdapterForTests(adapter: DimonaAdapter | null): void {
  registered = adapter;
}
