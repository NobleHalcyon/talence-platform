import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";

export const metadata = {
  title: "Choose a new password",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      description="Set a new password through the managed recovery session."
    >
      <div className={formStyles.form}>
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
            disabled
          />
        </FormField>
        <FormField inputId="confirm-password" label="Confirm new password">
          <TextInput
            id="confirm-password"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            disabled
          />
        </FormField>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="button" disabled>
            Update password
          </Button>
          <Link className={formStyles.supportingLink} href="/login">
            Return to sign in
          </Link>
          <p className={formStyles.phaseNote}>
            Password updates are activated with the admission foundation.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
