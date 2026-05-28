import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { prisma } from "@/infrastructure/db/prisma";

const SUPPORTED_LOCALES = ["en", "nl", "fr"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: SupportedLocale = "en";

function isSupported(locale: string | undefined): locale is SupportedLocale {
  return !!locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

/**
 * Resolves the active locale per request:
 *  1. authenticated `User.locale` (set via /settings/profile)
 *  2. `NEXT_LOCALE` cookie (anonymous language switcher)
 *  3. `Accept-Language` header (first matching supported locale)
 *  4. fallback to `DEFAULT_LOCALE`
 */
async function detectLocale(): Promise<SupportedLocale> {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locale: true },
      });
      if (isSupported(user?.locale)) return user!.locale as SupportedLocale;
    }
  } catch {
    // Auth lookups can fail during static rendering; fall back to cookies.
  }

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;
  if (isSupported(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  const preferred = accept
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim().toLowerCase().slice(0, 2))
    .find((code) => isSupported(code));
  if (isSupported(preferred)) return preferred;

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await detectLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});

export { SUPPORTED_LOCALES, DEFAULT_LOCALE };
export type { SupportedLocale };
