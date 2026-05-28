import { NextResponse } from "next/server";
import { getPublicVapidKey } from "@/infrastructure/push/sender";

/**
 * Returns the public VAPID key so the client can subscribe to push. We expose
 * the key publicly on purpose: it is the public half of the keypair.
 */
export function GET() {
  const key = getPublicVapidKey();
  if (!key) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}
