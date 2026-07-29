"use client";

import Script from "next/script";

import styles from "./auth-form.module.css";

export function CaptchaField({ siteKey }: { siteKey: string | null }) {
  if (!siteKey) {
    return null;
  }

  return (
    <div className={styles.captcha}>
      <Script
        id="talence-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-action="managed-auth"
        data-theme="light"
      />
      <noscript>Enable JavaScript to complete the required bot-protection check.</noscript>
    </div>
  );
}
