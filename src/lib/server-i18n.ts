import { createTranslator } from "next-intl";

const SUPPORTED = ["en", "nl", "fr"] as const;
type Supported = (typeof SUPPORTED)[number];

function normalize(locale: string | null | undefined): Supported {
  return locale && (SUPPORTED as readonly string[]).includes(locale)
    ? (locale as Supported)
    : "en";
}

type Messages = Record<string, unknown>;
const cache = new Map<Supported, Messages>();

async function loadMessages(locale: Supported): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = (await import(`../../messages/${locale}.json`))
    .default as Messages;
  cache.set(locale, messages);
  return messages;
}

/**
 * Builds a next-intl translator for use outside the request lifecycle (jobs,
 * scripts) so server-side notifications and emails respect each user's locale.
 */
export async function getTranslator(locale: string | null | undefined) {
  const normalized = normalize(locale);
  const messages = await loadMessages(normalized);
  return createTranslator({ locale: normalized, messages });
}
