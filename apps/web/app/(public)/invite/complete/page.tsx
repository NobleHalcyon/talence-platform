import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";
import { AuthStatus } from "@/components/auth/auth-status";
import { completeInvitationAction } from "@/features/auth/actions";

export const metadata = {
  title: "Complete your invitation",
};

interface InviteCompletePageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function InviteCompletePage({
  searchParams = Promise.resolve({}),
}: InviteCompletePageProps) {
  const query = await searchParams;

  return (
    <AuthShell
      title="Complete your invitation"
      description="Add the minimal profile details used inside your private Talence workspace."
    >
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>
      <form className={formStyles.form} action={completeInvitationAction}>
        <div className={formStyles.fieldRow}>
          <FormField inputId="display-name" label="Display name">
            <TextInput
              id="display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              maxLength={80}
            />
          </FormField>
          <FormField inputId="handle" label="Handle" hint="Unique within Talence.">
            <TextInput
              id="handle"
              name="handle"
              type="text"
              autoComplete="username"
              spellCheck={false}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]"
            />
          </FormField>
        </div>
        <fieldset className={formStyles.formSection}>
          <legend className={formStyles.visuallyHidden}>Managed authentication password</legend>
          <FormField
            inputId="invite-password"
            label="Password"
            hint="Use at least eight characters. The authentication provider may require more."
          >
            <TextInput
              id="invite-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </FormField>
          <FormField inputId="invite-password-confirmation" label="Confirm password">
            <TextInput
              id="invite-password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </FormField>
        </fieldset>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="submit">
            Enter Talence
          </Button>
          <p className={formStyles.phaseNote}>
            Admission provisioning is atomic and safe to retry. Passwords remain in managed
            authentication.
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
