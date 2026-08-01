import { redirect } from "next/navigation";

import { Button, FormField, InlineAlert, Panel, Select, TextInput } from "@talence/ui";

import { AuthStatus } from "@/components/auth/auth-status";
import formStyles from "@/components/auth/auth-form.module.css";
import { PageFrame } from "@/components/shell/page-frame";
import { updateSettingsAction } from "@/features/settings/actions";
import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_TABLES } from "@/lib/database/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import styles from "./settings.module.css";

export const metadata = {
  title: "Settings",
};

interface SettingsPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

interface Preferences {
  collection_view: string | null;
  deck_view: string | null;
}

type AttemptResult<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(operation: () => PromiseLike<T>): Promise<AttemptResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return { ok: false };
  }
}

function parsePreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null) {
    return { collection_view: null, deck_view: null };
  }

  return {
    collection_view:
      "collection_view" in value && typeof value.collection_view === "string"
        ? value.collection_view
        : null,
    deck_view: "deck_view" in value && typeof value.deck_view === "string" ? value.deck_view : null,
  };
}

export default async function SettingsPage({
  searchParams = Promise.resolve({}),
}: SettingsPageProps) {
  const [query, contextState, clientAttempt] = await Promise.all([
    searchParams,
    getAppContextState(),
    attempt(() => createServerSupabaseClient()),
  ]);

  if (contextState.status !== "ready" || !clientAttempt.ok || !clientAttempt.value) {
    redirect("/login?status=account_unavailable");
  }

  const supabase = clientAttempt.value;
  const preferencesAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.userPreferences)
      .select("collection_view, deck_view")
      .eq("user_id", contextState.context.userId)
      .maybeSingle(),
  );
  const preferences =
    preferencesAttempt.ok && !preferencesAttempt.value.error
      ? parsePreferences(preferencesAttempt.value.data)
      : { collection_view: null, deck_view: null };

  return (
    <PageFrame
      eyebrow="Account preferences"
      title="Settings"
      description="Profile, active defaults, preferred currency, and presentation preferences."
      constrained
    >
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>
      <form className={styles.form} action={updateSettingsAction}>
        <Panel className={styles.section}>
          <div className={styles.fieldGrid}>
            <header className={styles.sectionHeader}>
              <h2>Profile</h2>
              <p>Email identity and passwords remain in managed authentication.</p>
            </header>
            <FormField
              className={styles.settingsField}
              inputId="settings-display-name"
              label="Display name"
            >
              <TextInput
                id="settings-display-name"
                name="displayName"
                defaultValue={contextState.context.profile.display_name ?? ""}
                autoComplete="name"
                maxLength={80}
                required
              />
            </FormField>
            <FormField
              className={styles.settingsField}
              inputId="settings-handle"
              label="Handle"
              hint="Three to thirty lowercase letters, numbers, underscores, or hyphens."
            >
              <TextInput
                id="settings-handle"
                name="handle"
                defaultValue={contextState.context.profile.handle ?? ""}
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]"
                required
              />
            </FormField>
            <input
              type="hidden"
              name="avatarPath"
              value={contextState.context.profile.avatar_path ?? ""}
            />
            <div className={styles.gridNotice}>
              <InlineAlert title="Avatar storage" tone="information">
                Your profile is avatar-ready. Upload controls remain disabled until the private
                Supabase Storage bucket and MIME limits are configured.
              </InlineAlert>
            </div>

            <header className={styles.sectionHeader}>
              <h2>Workspace defaults</h2>
              <p>All mutable resources continue to be scoped to an accessible workspace.</p>
            </header>
            <FormField
              className={styles.settingsField}
              inputId="settings-workspace"
              label="Default workspace"
              hint="This workspace becomes the default context after settings are saved."
            >
              <Select
                id="settings-workspace"
                name="defaultWorkspaceId"
                defaultValue={contextState.context.workspace.id}
              >
                {contextState.context.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              className={styles.settingsField}
              inputId="settings-collection"
              label="Default collection"
            >
              <Select
                id="settings-collection"
                name="defaultCollectionId"
                defaultValue={
                  contextState.context.profile.default_collection_id ??
                  contextState.context.collections[0]?.id ??
                  ""
                }
              >
                {contextState.context.collections.length === 0 ? (
                  <option value="">No active collection</option>
                ) : null}
                {contextState.context.collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <header className={styles.sectionHeader}>
              <h2>Display preferences</h2>
              <p>These settings change presentation only; they never authorize access.</p>
            </header>
            <FormField
              className={styles.settingsField}
              inputId="settings-currency"
              label="Preferred currency"
            >
              <Select
                id="settings-currency"
                name="preferredCurrency"
                defaultValue={contextState.context.profile.preferred_currency}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="TIX">TIX</option>
              </Select>
            </FormField>
            <FormField
              className={styles.settingsField}
              inputId="settings-collection-view"
              label="Collection view"
            >
              <Select
                id="settings-collection-view"
                name="collectionView"
                defaultValue={preferences.collection_view ?? "structured"}
              >
                <option value="structured">Structured</option>
                <option value="gallery">Gallery</option>
                <option value="analytical">Analytical</option>
              </Select>
            </FormField>
            <FormField
              className={styles.settingsField}
              inputId="settings-deck-view"
              label="Deck view"
            >
              <Select
                id="settings-deck-view"
                name="deckView"
                defaultValue={preferences.deck_view ?? "list"}
              >
                <option value="list">Compact list</option>
                <option value="visual">Grouped visual</option>
              </Select>
            </FormField>
          </div>
        </Panel>

        <div className={styles.actions}>
          <Button type="submit">Save settings</Button>
        </div>
      </form>
    </PageFrame>
  );
}
