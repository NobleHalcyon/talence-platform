import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";
import { AuthStatus } from "@/components/auth/auth-status";
import { CaptchaField } from "@/components/auth/captcha-field";
import { requestPasswordRecoveryAction } from "@/features/auth/actions";
import { getCaptchaSiteKey } from "@/lib/supabase/config";

export const metadata = {
  title: "Recover access",
};

interface ForgotPasswordPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function ForgotPasswordPage({
  searchParams = Promise.resolve({}),
}: ForgotPasswordPageProps) {
  const query = await searchParams;

  return (
    <AuthShell
      title="Recover access"
      description="If this address belongs to an admitted account, the managed authentication service can send recovery instructions."
    >
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>
      <form className={formStyles.form} action={requestPasswordRecoveryAction}>
        <FormField
          inputId="recovery-email"
          label="Email address"
          hint="Responses remain generic to protect account privacy."
        >
          <TextInput
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
          />
        </FormField>
        <CaptchaField siteKey={getCaptchaSiteKey()} />
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="submit">
            Send recovery instructions
          </Button>
          <Link className={formStyles.supportingLink} href="/login">
            Return to sign in
          </Link>
          <p className={formStyles.phaseNote}>
            Responses are identical whether or not an admitted account exists.
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
