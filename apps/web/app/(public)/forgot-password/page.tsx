import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";

export const metadata = {
  title: "Recover access",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recover access"
      description="If this address belongs to an admitted account, the managed authentication service can send recovery instructions."
    >
      <div className={formStyles.form}>
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
            disabled
          />
        </FormField>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="button" disabled>
            Send recovery instructions
          </Button>
          <Link className={formStyles.supportingLink} href="/login">
            Return to sign in
          </Link>
          <p className={formStyles.phaseNote}>
            Recovery delivery is activated with the admission foundation.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
