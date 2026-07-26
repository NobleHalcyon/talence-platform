import Link from "next/link";

import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      description="Use the email address associated with your Talence invitation."
    >
      <div className={formStyles.form}>
        <FormField inputId="login-email" label="Email address">
          <TextInput
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            disabled
          />
        </FormField>
        <FormField inputId="login-password" label="Password">
          <TextInput
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled
          />
        </FormField>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="button" disabled>
            Sign in
          </Button>
          <Link className={formStyles.supportingLink} href="/forgot-password">
            Forgot your password?
          </Link>
          <p className={formStyles.phaseNote}>
            Managed sign-in is activated with the admission foundation.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
