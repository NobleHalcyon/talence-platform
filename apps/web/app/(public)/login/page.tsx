import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";
import { AuthStatus } from "@/components/auth/auth-status";
import { CaptchaField } from "@/components/auth/captcha-field";
import { signInAction } from "@/features/auth/actions";
import { getCaptchaSiteKey } from "@/lib/supabase/config";

export const metadata = {
  title: "Sign in",
};

interface LoginPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams = Promise.resolve({}) }: LoginPageProps) {
  const query = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      description="Use the email address associated with your Talence invitation."
    >
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>
      <form className={formStyles.form} action={signInAction}>
        <FormField inputId="login-email" label="Email address">
          <TextInput
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
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
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="submit">
            Sign in
          </Button>
          <Link className={formStyles.supportingLink} href="/forgot-password">
            Forgot your password?
          </Link>
          <p className={formStyles.phaseNote}>Access is limited to admitted private-beta users.</p>
        </div>
      </form>
    </AuthShell>
  );
}
