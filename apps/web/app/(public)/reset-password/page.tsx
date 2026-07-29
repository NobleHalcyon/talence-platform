import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";
import { AuthStatus } from "@/components/auth/auth-status";
import { resetPasswordAction } from "@/features/auth/actions";

export const metadata = {
  title: "Choose a new password",
};

interface ResetPasswordPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function ResetPasswordPage({
  searchParams = Promise.resolve({}),
}: ResetPasswordPageProps) {
  const query = await searchParams;

  return (
    <AuthShell
      title="Choose a new password"
      description="Set a new password through the managed recovery session."
    >
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>
      <form className={formStyles.form} action={resetPasswordAction}>
        <FormField
          inputId="new-password"
          label="New password"
          hint="Password policy is enforced by the configured authentication provider."
        >
          <TextInput
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </FormField>
        <FormField inputId="confirm-password" label="Confirm new password">
          <TextInput
            id="confirm-password"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </FormField>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="submit">
            Update password
          </Button>
          <Link className={formStyles.supportingLink} href="/login">
            Return to sign in
          </Link>
          <p className={formStyles.phaseNote}>
            Talence never receives or stores this password outside managed authentication.
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
