import Image from "next/image";
import Link from "next/link";

import { Button, FormField, InlineAlert, TextInput } from "@talence/ui";

import { AuthStatus } from "@/components/auth/auth-status";
import { CaptchaField } from "@/components/auth/captcha-field";
import { TALENCE_EMBLEM_SRC } from "@/components/brand/brand-assets";
import { signInAction } from "@/features/auth/actions";
import { getSafeStatus } from "@/lib/auth/safe-status";
import { getCaptchaSiteKey, isSupabaseConfigured } from "@/lib/supabase/config";

import styles from "./sign-in-landing.module.css";

export interface SignInLandingProps {
  requestId?: string | string[];
  status?: string | string[];
}

export function SignInLanding({ requestId, status }: SignInLandingProps) {
  const configured = isSupabaseConfigured();
  const hasStatus = Boolean(getSafeStatus(status));

  return (
    <main
      className={hasStatus ? `${styles.page} ${styles.pageWithStatus}` : styles.page}
      id="main-content"
    >
      <div className={styles.geometry} aria-hidden="true" />

      <section className={styles.identity} aria-labelledby="talence-title">
        <div className={styles.identityInner}>
          <Image
            className={styles.emblem}
            src={TALENCE_EMBLEM_SRC}
            width={602}
            height={608}
            priority
            alt="Talence emblem"
          />
          <h1 className={styles.wordmark} id="talence-title">
            Talence
          </h1>
          <p className={styles.betaLine}>Private Beta Underway</p>
        </div>
      </section>

      <section className={styles.access} aria-labelledby="sign-in-title">
        <div className={styles.accessInner}>
          <header className={styles.formHeader}>
            <span className={styles.divider} aria-hidden="true" />
            <h2 className={styles.formTitle} id="sign-in-title">
              Sign in
            </h2>
          </header>

          <div className={styles.status}>
            <AuthStatus status={status} requestId={requestId} />
          </div>

          {!configured ? (
            <div className={styles.notice}>
              <InlineAlert title="Local preview mode" tone="information">
                Supabase browser configuration is not present. The sign-in page remains available
                without attempting an authentication request.
              </InlineAlert>
            </div>
          ) : null}

          <form className={styles.form} action={signInAction}>
            <FormField inputId="login-identifier" label="Username or email">
              <TextInput
                id="login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </FormField>
            <FormField inputId="login-password" label="Password">
              <TextInput
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </FormField>
            <CaptchaField siteKey={getCaptchaSiteKey()} />
            <div className={styles.formActions}>
              <Button className={styles.submit} size="large" type="submit">
                Sign in
              </Button>
              <Link className={styles.recovery} href="/forgot-password">
                Forgot your password?
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
