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

let registered: DimonaAdapter | null = null;

/**
 * Returns the adapter selected by environment:
 *
 * - `DIMONA_ENV=prod` → `HttpDimonaAdapter` against `DIMONA_PROD_URL`.
 * - `DIMONA_ENV=sandbox` → `HttpDimonaAdapter` against `DIMONA_SANDBOX_URL`.
 * - Anything else (including unset) → `MockDimonaAdapter`.
 *
 * `DIMONA_TOKEN` is required for both `prod` and `sandbox`.
 *
 * The returned adapter is cached process-wide; call
 * `__setDimonaAdapterForTests(null)` to clear in tests.
 */
export function getDimonaAdapter(): DimonaAdapter {
  if (registered) return registered;
  const env = process.env.DIMONA_ENV;
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
