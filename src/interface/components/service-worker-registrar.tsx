"use client";

import { useEffect } from "react";

/**
 * Registers the static service worker at `/sw.js` so the calendar shell can be
 * cached for offline use. No-ops during SSR and when the browser does not
 * expose a `serviceWorker` API (e.g. older mobile browsers).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration is best-effort
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
