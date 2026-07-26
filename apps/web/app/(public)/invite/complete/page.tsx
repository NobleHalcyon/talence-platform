import { Button, FormField, TextInput } from "@talence/ui";

import { AuthShell } from "@/components/auth/auth-shell";
import formStyles from "@/components/auth/auth-form.module.css";

export const metadata = {
  title: "Complete your invitation",
};

export default function InviteCompletePage() {
  return (
    <AuthShell
      title="Complete your invitation"
      description="Add the minimal profile details used inside your private Talence workspace."
    >
      <div className={formStyles.form}>
        <div className={formStyles.fieldRow}>
          <FormField inputId="display-name" label="Display name">
            <TextInput
              id="display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              disabled
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
              disabled
            />
          </FormField>
        </div>
        <div className={formStyles.formActions}>
          <Button className={formStyles.submit} type="button" disabled>
            Enter Talence
          </Button>
          <p className={formStyles.phaseNote}>
            Atomic admission finalization is activated in Phase 1.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
