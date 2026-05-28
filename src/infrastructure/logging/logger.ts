import pino from "pino";

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  event: string;
  [key: string]: unknown;
}

/**
 * Single shared pino instance. Pretty-printing is disabled by default to keep
 * production JSON parsing simple; flip on `LOG_PRETTY=1` for local dev if
 * needed.
 */
const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export function log(level: LogLevel, payload: LogPayload): void {
  pinoInstance[level](payload);
}

export const logger = {
  info: (payload: LogPayload) => log("info", payload),
  warn: (payload: LogPayload) => log("warn", payload),
  error: (payload: LogPayload) => log("error", payload),
};
