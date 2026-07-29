import { notFound } from "next/navigation";

import {
  Button,
  DataTable,
  ErrorState,
  FormField,
  InlineAlert,
  Panel,
  StatusBadge,
  Tabs,
  TextInput,
} from "@talence/ui";

import { AuthStatus } from "@/components/auth/auth-status";
import formStyles from "@/components/auth/auth-form.module.css";
import { PageFrame } from "@/components/shell/page-frame";
import {
  issueInviteAction,
  listInvitedUsers,
  resendInviteAction,
  revokeInviteAction,
} from "@/features/admin/actions";
import { invitationsEnabled } from "@/features/admin/config";
import { getAppContextState } from "@/lib/auth/app-context";
import type { InvitedUserRecord } from "@/lib/database/contracts";

import styles from "./invites.module.css";

export const metadata = {
  title: "Invitation administration",
};

interface AdminInvitesPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

function defaultExpirationDate(): string {
  const date = new Date();
  const ttl = Number(process.env.INVITATION_DEFAULT_TTL_DAYS ?? "7");
  date.setUTCDate(date.getUTCDate() + (Number.isFinite(ttl) ? ttl : 7));
  return date.toISOString().slice(0, 10);
}

function effectiveStatus(invitation: InvitedUserRecord): InvitedUserRecord["status"] {
  if (invitation.effective_status) {
    return invitation.effective_status;
  }
  if (
    ["draft", "failed", "sent"].includes(invitation.status) &&
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return invitation.status;
}

function statusTone(
  status: InvitedUserRecord["status"],
): "danger" | "information" | "neutral" | "success" | "warning" {
  switch (status) {
    case "accepted":
      return "success";
    case "revoked":
    case "failed":
      return "danger";
    case "expired":
      return "warning";
    case "sent":
      return "information";
    default:
      return "neutral";
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not yet";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

export default async function AdminInvitesPage({
  searchParams = Promise.resolve({}),
}: AdminInvitesPageProps) {
  const [query, contextState] = await Promise.all([searchParams, getAppContextState()]);
  if (contextState.status !== "ready" || !contextState.context.isPlatformAdmin) {
    notFound();
  }

  const enabled = invitationsEnabled();
  const inviteList = await listInvitedUsers();

  return (
    <PageFrame
      eyebrow="Platform administration"
      title="Invitations"
      description="Issue, inspect, resend, and revoke private-beta admission through trusted server operations."
      constrained
    >
      <Tabs
        label="Administration"
        items={[
          { href: "/app/admin/invites", label: "Invitations", active: true },
          { href: "/app/admin/catalog", label: "Catalog" },
          { href: "/app/admin/operations", label: "Operations" },
        ]}
      />
      <div className={formStyles.status}>
        <AuthStatus status={query.status} requestId={query.request_id} />
      </div>

      {!enabled ? (
        <div className={styles.notice}>
          <InlineAlert title="Invitation sending is disabled" tone="warning">
            The server-side invitation kill switch is off. Existing status remains readable, but
            sending fails closed until an operator enables it.
          </InlineAlert>
        </div>
      ) : null}

      <Panel className={styles.issuePanel}>
        <header className={styles.sectionHeader}>
          <h2>Issue an invitation</h2>
          <p>
            Talence commits the private admission row before managed authentication creates the user
            and sends email.
          </p>
        </header>
        <form className={styles.issueForm} action={issueInviteAction}>
          <FormField inputId="invite-email" label="Email address">
            <TextInput
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              inputMode="email"
              maxLength={254}
              required
              disabled={!enabled}
            />
          </FormField>
          <FormField
            inputId="invite-expires"
            label="Expiration date"
            hint="Must be in the future and no more than thirty-one days away."
          >
            <TextInput
              id="invite-expires"
              name="expiresAt"
              type="date"
              defaultValue={defaultExpirationDate()}
              required
              disabled={!enabled}
            />
          </FormField>
          <FormField
            inputId="invite-note"
            label="Internal note"
            hint="Optional. Plain text, up to 500 characters."
          >
            <TextInput
              id="invite-note"
              name="note"
              type="text"
              maxLength={500}
              disabled={!enabled}
            />
          </FormField>
          <div className={styles.issueAction}>
            <Button type="submit" disabled={!enabled}>
              Send invitation
            </Button>
          </div>
        </form>
      </Panel>

      <section className={styles.listSection} aria-labelledby="invitation-ledger-title">
        <header className={styles.sectionHeader}>
          <h2 id="invitation-ledger-title">Admission ledger</h2>
          <p>Only bounded, safe status data is shown. Authentication secrets never appear here.</p>
        </header>
        {inviteList.error ? (
          <ErrorState
            title="Invitation status is unavailable"
            message="No invitation was changed. Verify trusted server configuration and retry."
          />
        ) : inviteList.invitations.length === 0 ? (
          <Panel className={styles.empty}>
            <h3>No invitations yet</h3>
            <p>Issue the first private-beta invitation above.</p>
          </Panel>
        ) : (
          <DataTable label="Private-beta invitations">
            <table>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Safe failure</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inviteList.invitations.map((invitation) => {
                  const status = effectiveStatus(invitation);
                  const mayResend =
                    (status === "expired" && !invitation.auth_user_id) ||
                    (["draft", "failed"].includes(status) && !invitation.auth_user_id);
                  const mayRevoke =
                    status !== "accepted" &&
                    (status !== "revoked" || Boolean(invitation.auth_user_id));
                  return (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>
                        <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                      </td>
                      <td>{formatDate(invitation.expires_at)}</td>
                      <td>{formatDate(invitation.sent_at)}</td>
                      <td>{invitation.last_error_code ?? "None"}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {mayResend ? (
                            <form action={resendInviteAction}>
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button
                                type="submit"
                                size="small"
                                variant="secondary"
                                disabled={!enabled}
                              >
                                Resend
                              </Button>
                            </form>
                          ) : null}
                          {mayRevoke ? (
                            <form action={revokeInviteAction}>
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button type="submit" size="small" variant="danger">
                                {status === "revoked" ? "Retry cleanup" : "Revoke"}
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTable>
        )}
      </section>
    </PageFrame>
  );
}
