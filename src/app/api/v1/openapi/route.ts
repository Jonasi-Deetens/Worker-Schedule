import { NextResponse } from "next/server";
import { API_SCOPES } from "@/application/services/api-key-service";

/**
 * Hand-rolled OpenAPI 3.1 document for the public REST endpoints. We avoid
 * `trpc-openapi` for now because it pins us to an older tRPC release; this
 * document covers every public endpoint we ship.
 */
const doc = {
  openapi: "3.1.0",
  info: {
    title: "Tattoogenda Public API",
    version: "1.0.0",
    description:
      "Read-and-write access to shifts and assignments using API keys.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "tg_..." },
    },
    schemas: {
      Shift: {
        type: "object",
        required: ["id", "startsAt", "endsAt", "roleLabel", "requiredSpots"],
        properties: {
          id: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          roleLabel: { type: "string" },
          requiredSpots: { type: "integer" },
          notes: { type: "string", nullable: true },
          publishedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  paths: {
    "/shifts": {
      get: {
        summary: "List shifts in a date range",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["shifts:read"],
        parameters: [
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" },
          },
        ],
        responses: {
          200: {
            description: "Shifts within the range",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Shift" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a new shift",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["shifts:write"],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            description:
              "Client-generated unique key. Re-sending the same key with the same body within 24h replays the original response; a different body returns 409.",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["startsAt", "endsAt", "roleLabel", "requiredSpots"],
                properties: {
                  startsAt: { type: "string", format: "date-time" },
                  endsAt: { type: "string", format: "date-time" },
                  roleLabel: { type: "string" },
                  requiredSpots: { type: "integer" },
                  notes: { type: "string" },
                  requiredSkillId: { type: "string" },
                  publish: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Shift created" },
          400: { description: "Validation error" },
          409: { description: "Idempotency-Key collision with different body" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
  },
  "x-available-scopes": API_SCOPES,
  "x-rate-limits": {
    read: "600 requests/minute per API key",
    write: "120 requests/minute per API key",
  },
};

export function GET() {
  return NextResponse.json(doc);
}
