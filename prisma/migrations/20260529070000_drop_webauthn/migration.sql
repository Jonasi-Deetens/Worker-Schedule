-- Remove the unused WebAuthn scaffold. The `webauthn_credentials` table was
-- schema-only dead code (no services, routers or UI ever referenced it and the
-- `@simplewebauthn/*` packages were never installed). Dropping it removes the
-- confusion and keeps the schema honest.

DROP TABLE IF EXISTS "webauthn_credentials";
