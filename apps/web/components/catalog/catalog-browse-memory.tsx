"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "talence:catalog-scroll:";

export function CatalogBrowseMemory({ cacheKey }: { cacheKey: string }) {
  useEffect(() => {
    const main = document.getElementById("main-content");
    const storageKey = `${STORAGE_PREFIX}${cacheKey}`;

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const position = JSON.parse(raw) as { main?: number; window?: number };
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (main && typeof position.main === "number") main.scrollTop = position.main;
            if (typeof position.window === "number" && position.window > 0) {
              window.scrollTo(0, position.window);
            }
          });
        });
      }
    } catch {
      // Scroll restoration is intentionally best-effort.
    }

    const remember = () => {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ main: main?.scrollTop ?? 0, window: window.scrollY }),
        );
      } catch {
        // Storage may be unavailable in privacy modes; URL state remains authoritative.
      }
    };

    main?.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("pagehide", remember);
    return () => {
      remember();
      main?.removeEventListener("scroll", remember);
      window.removeEventListener("scroll", remember);
      window.removeEventListener("pagehide", remember);
    };
  }, [cacheKey]);

  return null;
}
