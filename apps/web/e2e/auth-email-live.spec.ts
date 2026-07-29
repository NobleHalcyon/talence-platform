import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

import { readLocalSupabaseStatus, repositoryRoot } from "../../../scripts/lib/local-supabase.mjs";

interface MailpitAddress {
  Address?: string;
}

interface MailpitMessageSummary {
  ID?: string;
  Subject?: string;
  To?: MailpitAddress[];
}

interface MailpitMessageDetail {
  HTML?: string | string[];
  Text?: string | string[];
}

interface CapturedEmail {
  html: string;
  text: string;
}

interface ProvisioningState {
  invitation_status: string | null;
  mtg_collection_count: number;
  owner_membership_count: number;
  personal_workspace_count: number;
  profile_count: number;
  preference_count: number;
}

const localSupabase = readLocalSupabaseStatus();
const applicationOrigin = "http://localhost:3000";
const mailpitOrigin = "http://127.0.0.1:54324";
const initialPassword = "Talence-local-invite-2026!";
const recoveredPassword = "Talence-local-recovery-2026!";

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function syntheticEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

function managedClient(key: string) {
  return createClient(localSupabase.apiUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function issueLocalInvitation(email: string): void {
  const tsxCli = path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const inviteScript = path.join(repositoryRoot, "scripts", "admin", "invite-user.ts");
  const result = spawnSync(process.execPath, [tsxCli, inviteScript, "--email", email], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FEATURE_INVITATIONS_ENABLED: "true",
      NEXT_PUBLIC_APP_ORIGIN: applicationOrigin,
      SUPABASE_SECRET_KEY: localSupabase.secretKey,
      SUPABASE_URL: localSupabase.apiUrl,
      TALENCE_AUTH_INVITE_REDIRECT_URL: `${applicationOrigin}/auth/callback?type=invite&next=/invite/complete`,
      TALENCE_DATABASE_URL: localSupabase.databaseUrl,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  invariant(!result.error && result.status === 0, "trusted_local_invitation_failed");
}

function messageBody(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join("\n") : (value ?? "");
}

async function findCapturedEmail(email: string, subject: string): Promise<CapturedEmail | null> {
  const response = await fetch(`${mailpitOrigin}/api/v1/messages`);
  invariant(response.ok, "mailpit_message_list_unavailable");
  const payload = (await response.json()) as { messages?: MailpitMessageSummary[] };
  const summary = payload.messages?.find(
    (message) =>
      message.Subject === subject &&
      message.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()),
  );
  if (!summary?.ID) return null;

  const detailResponse = await fetch(
    `${mailpitOrigin}/api/v1/message/${encodeURIComponent(summary.ID)}`,
  );
  invariant(detailResponse.ok, "mailpit_message_unavailable");
  const detail = (await detailResponse.json()) as MailpitMessageDetail;
  const html = messageBody(detail.HTML);
  if (!html) return null;
  return {
    html,
    text: messageBody(detail.Text),
  };
}

async function waitForCapturedEmail(email: string, subject: string): Promise<CapturedEmail> {
  let captured: CapturedEmail | null = null;
  await expect
    .poll(
      async () => {
        captured = await findCapturedEmail(email, subject);
        return Boolean(captured);
      },
      { message: "Expected local managed-auth email was not captured by Mailpit." },
    )
    .toBe(true);
  invariant(captured, "mailpit_message_missing");
  return captured;
}

function callbackFromEmail(
  email: CapturedEmail,
  expectedType: "invite" | "recovery",
  expectedNext: "/invite/complete" | "/reset-password",
): { tokenHash: string; url: URL } {
  const href = email.html.match(/href="([^"]+)"/u)?.[1]?.replaceAll("&amp;", "&");
  invariant(href, "managed_auth_email_link_missing");

  const url = new URL(href);
  const tokenHash = url.searchParams.get("token_hash");
  invariant(url.origin === applicationOrigin, "managed_auth_email_origin_invalid");
  invariant(url.pathname === "/auth/callback", "managed_auth_email_path_invalid");
  invariant(url.searchParams.get("type") === expectedType, "managed_auth_email_type_invalid");
  invariant(url.searchParams.get("next") === expectedNext, "managed_auth_email_next_invalid");
  invariant(
    tokenHash && /^[A-Za-z0-9_-]{16,512}$/u.test(tokenHash),
    "managed_auth_email_token_hash_invalid",
  );
  invariant(url.hash === "", "managed_auth_email_fragment_present");
  invariant(!email.html.includes("/auth/v1/verify"), "provider_verification_link_still_used");
  invariant(!/access_token|refresh_token/iu.test(email.html), "session_credential_in_email");
  invariant(!/access_token|refresh_token/iu.test(email.text), "session_credential_in_email_text");
  invariant(
    [...url.searchParams.keys()].sort().join(",") === "next,token_hash,type",
    "managed_auth_email_query_invalid",
  );
  return { tokenHash, url };
}

async function clickCapturedEmail(
  page: Page,
  email: CapturedEmail,
  linkName: string,
): Promise<void> {
  await page.setContent(email.html);
  try {
    await page.getByRole("link", { name: linkName }).click();
  } catch {
    throw new Error("managed_auth_email_navigation_failed");
  }
}

async function waitForLocation(page: Page, pathname: string, status?: string): Promise<void> {
  await expect
    .poll(() => {
      try {
        const current = new URL(page.url());
        return (
          current.pathname === pathname &&
          (status === undefined || current.searchParams.get("status") === status)
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
}

async function assertSessionNotExposed(
  context: BrowserContext,
  page: Page,
  tokenHash: string,
): Promise<void> {
  const currentUrl = new URL(page.url());
  invariant(!currentUrl.search.includes(tokenHash), "token_hash_retained_in_browser_url");
  invariant(!currentUrl.hash, "session_fragment_retained_in_browser_url");
  const rendered = await page.content();
  invariant(!rendered.includes(tokenHash), "token_hash_rendered_by_application");
  const browserStorage = await page.evaluate(() => ({
    cookies: document.cookie,
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
  }));
  invariant(!browserStorage.cookies.includes("sb-"), "auth_cookie_visible_to_javascript");
  invariant(
    !/access_token|refresh_token/iu.test(browserStorage.local),
    "session_credential_in_local_storage",
  );
  invariant(
    !/access_token|refresh_token/iu.test(browserStorage.session),
    "session_credential_in_session_storage",
  );
  const authCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
  invariant(authCookies.length > 0, "server_auth_cookie_missing");
  invariant(
    authCookies.every((cookie) => cookie.httpOnly),
    "server_auth_cookie_not_http_only",
  );
}

async function assertSafeCallbackFailure(
  page: Page,
  expectedStatus: "callback_code_missing" | "callback_failed",
  tokenHash?: string,
): Promise<void> {
  await waitForLocation(page, "/login", expectedStatus);
  const currentUrl = new URL(page.url());
  invariant(!currentUrl.searchParams.has("token_hash"), "failed_token_retained_in_url");
  const rendered = await page.content();
  if (tokenHash) {
    invariant(!rendered.includes(tokenHash), "failed_token_rendered");
  }
  invariant(
    !/token has expired|token has been used|invalid token|provider error/iu.test(rendered),
    "raw_provider_error_rendered",
  );
}

async function provisioningState(database: pg.Client, email: string): Promise<ProvisioningState> {
  const result = await database.query<ProvisioningState>(
    `
      with identity as (
        select id
        from auth.users
        where lower(email) = lower($1)
      ),
      profile as (
        select p.*
        from public.profiles as p
        join identity on identity.id = p.user_id
      )
      select
        (
          select invited.status::text
          from app_private.invited_users as invited
          where invited.email = lower($1)
          order by invited.created_at desc
          limit 1
        ) as invitation_status,
        (
          select count(*)::integer
          from public.profiles as p
          join identity on identity.id = p.user_id
        ) as profile_count,
        (
          select count(*)::integer
          from public.workspaces as workspace
          join profile on profile.default_workspace_id = workspace.id
          where workspace.type = 'personal'::public.workspace_type
        ) as personal_workspace_count,
        (
          select count(*)::integer
          from public.workspace_memberships as membership
          join profile
            on profile.default_workspace_id = membership.workspace_id
            and profile.user_id = membership.user_id
          where membership.role = 'owner'::public.membership_role
            and membership.status = 'active'::public.membership_status
        ) as owner_membership_count,
        (
          select count(*)::integer
          from public.user_preferences as preference
          join identity on identity.id = preference.user_id
        ) as preference_count,
        (
          select count(*)::integer
          from public.collections as collection
          join public.games as game on game.id = collection.game_id
          join profile on profile.default_collection_id = collection.id
          where game.code = 'mtg'
        ) as mtg_collection_count
    `,
    [email],
  );
  invariant(result.rowCount === 1, "provisioning_state_missing");
  return result.rows[0]!;
}

async function expectProvisionedExactlyOnce(database: pg.Client, email: string): Promise<void> {
  await expect(provisioningState(database, email)).resolves.toEqual({
    invitation_status: "accepted",
    mtg_collection_count: 1,
    owner_membership_count: 1,
    personal_workspace_count: 1,
    preference_count: 1,
    profile_count: 1,
  });
}

async function expireManagedInvite(database: pg.Client, email: string): Promise<void> {
  const result = await database.query(
    `
      update auth.users
      set
        confirmation_sent_at = statement_timestamp() - interval '2 hours',
        invited_at = statement_timestamp() - interval '2 hours'
      where lower(email) = lower($1)
      returning id
    `,
    [email],
  );
  invariant(result.rowCount === 1, "managed_invite_expiration_fixture_failed");
}

async function assertSensitiveValuesAbsentFromAudit(
  database: pg.Client,
  sensitiveValues: string[],
): Promise<void> {
  for (const sensitiveValue of sensitiveValues) {
    const result = await database.query<{ occurrence_count: number }>(
      `
        select count(*)::integer as occurrence_count
        from public.audit_events as event
        where strpos(to_jsonb(event)::text, $1) > 0
      `,
      [sensitiveValue],
    );
    invariant(result.rows[0]?.occurrence_count === 0, "sensitive_value_persisted_in_audit");
  }
}

async function freshPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("real invite and recovery emails complete securely through the browser", async ({
  browser,
}) => {
  const database = new pg.Client({ connectionString: localSupabase.databaseUrl });
  await database.connect();

  try {
    const uninvitedEmail = syntheticEmail("uninvited");
    const admin = managedClient(localSupabase.secretKey);
    await expect
      .poll(
        async () => {
          const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
          return !result.error;
        },
        { message: "Local managed Auth did not become database-ready." },
      )
      .toBe(true);
    const uninvitedAdminResult = await admin.auth.admin.inviteUserByEmail(uninvitedEmail, {
      redirectTo: `${applicationOrigin}/auth/callback?type=invite&next=/invite/complete`,
    });
    invariant(
      Boolean(uninvitedAdminResult.error) &&
        (uninvitedAdminResult.error?.status ?? 500) < 500 &&
        !uninvitedAdminResult.data.user,
      "uninvited_admin_creation_succeeded",
    );

    const expiredEmail = syntheticEmail("expired-invite");
    issueLocalInvitation(expiredEmail);
    const expiredMessage = await waitForCapturedEmail(expiredEmail, "You are invited to Talence");
    const expiredCallback = callbackFromEmail(expiredMessage, "invite", "/invite/complete");
    await expireManagedInvite(database, expiredEmail);
    const expiredBrowser = await freshPage(browser);
    await clickCapturedEmail(expiredBrowser.page, expiredMessage, "Accept invitation");
    await assertSafeCallbackFailure(
      expiredBrowser.page,
      "callback_failed",
      expiredCallback.tokenHash,
    );
    await expect(provisioningState(database, expiredEmail)).resolves.toMatchObject({
      invitation_status: "sent",
      mtg_collection_count: 0,
      owner_membership_count: 0,
      personal_workspace_count: 0,
      preference_count: 0,
      profile_count: 0,
    });
    await expiredBrowser.context.close();

    const invalidBrowser = await freshPage(browser);
    const invalidTokenHash = "invalid-token-hash-value".padEnd(56, "x");
    await invalidBrowser.page.goto(
      `${applicationOrigin}/auth/callback?token_hash=${invalidTokenHash}&type=invite&next=/invite/complete`,
    );
    await assertSafeCallbackFailure(invalidBrowser.page, "callback_failed", invalidTokenHash);
    await invalidBrowser.page.goto(
      `${applicationOrigin}/auth/callback?type=invite&next=/invite/complete`,
    );
    await assertSafeCallbackFailure(invalidBrowser.page, "callback_code_missing");
    await invalidBrowser.page.goto(
      `${applicationOrigin}/auth/callback?token_hash=short&type=invite&next=/invite/complete`,
    );
    await assertSafeCallbackFailure(invalidBrowser.page, "callback_code_missing", "short");
    await invalidBrowser.context.close();

    const admittedEmail = syntheticEmail("accepted-invite");
    issueLocalInvitation(admittedEmail);
    const invitationMessage = await waitForCapturedEmail(
      admittedEmail,
      "You are invited to Talence",
    );
    const invitationCallback = callbackFromEmail(invitationMessage, "invite", "/invite/complete");
    const admittedBrowser = await freshPage(browser);
    await clickCapturedEmail(admittedBrowser.page, invitationMessage, "Accept invitation");
    await waitForLocation(admittedBrowser.page, "/invite/complete");
    await assertSessionNotExposed(
      admittedBrowser.context,
      admittedBrowser.page,
      invitationCallback.tokenHash,
    );

    const handle = `invite_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    await admittedBrowser.page.getByLabel("Display name").fill("Local Invite Acceptance");
    await admittedBrowser.page.getByLabel("Handle").fill(handle);
    await admittedBrowser.page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await admittedBrowser.page.getByLabel("Confirm password").fill(initialPassword);
    await admittedBrowser.page.getByRole("button", { name: "Enter Talence" }).click();
    await waitForLocation(admittedBrowser.page, "/app", "invitation_complete");
    await expectProvisionedExactlyOnce(database, admittedEmail);

    await admittedBrowser.page.getByRole("button", { name: "Sign out" }).click();
    await waitForLocation(admittedBrowser.page, "/login", "signed_out");
    await admittedBrowser.page.getByLabel("Email address").fill(admittedEmail);
    await admittedBrowser.page.getByLabel("Password").fill(initialPassword);
    await admittedBrowser.page.getByRole("button", { name: "Sign in" }).click();
    await waitForLocation(admittedBrowser.page, "/app");
    await admittedBrowser.page.getByRole("button", { name: "Sign out" }).click();
    await waitForLocation(admittedBrowser.page, "/login", "signed_out");

    const reusedInviteBrowser = await freshPage(browser);
    await clickCapturedEmail(reusedInviteBrowser.page, invitationMessage, "Accept invitation");
    await assertSafeCallbackFailure(
      reusedInviteBrowser.page,
      "callback_failed",
      invitationCallback.tokenHash,
    );
    await reusedInviteBrowser.context.close();
    await expectProvisionedExactlyOnce(database, admittedEmail);

    await admittedBrowser.page.goto("/forgot-password");
    await admittedBrowser.page.getByLabel("Email address").fill(admittedEmail);
    await admittedBrowser.page.getByRole("button", { name: "Send recovery instructions" }).click();
    await waitForLocation(admittedBrowser.page, "/forgot-password", "recovery_sent");

    const recoveryMessage = await waitForCapturedEmail(
      admittedEmail,
      "Reset your Talence password",
    );
    const recoveryCallback = callbackFromEmail(recoveryMessage, "recovery", "/reset-password");
    await clickCapturedEmail(admittedBrowser.page, recoveryMessage, "Reset password");
    await waitForLocation(admittedBrowser.page, "/reset-password");
    await assertSessionNotExposed(
      admittedBrowser.context,
      admittedBrowser.page,
      recoveryCallback.tokenHash,
    );
    await admittedBrowser.page.getByLabel("New password", { exact: true }).fill(recoveredPassword);
    await admittedBrowser.page
      .getByLabel("Confirm new password", { exact: true })
      .fill(recoveredPassword);
    await admittedBrowser.page.getByRole("button", { name: "Update password" }).click();
    await waitForLocation(admittedBrowser.page, "/login", "password_updated");
    await admittedBrowser.page.getByLabel("Email address").fill(admittedEmail);
    await admittedBrowser.page.getByLabel("Password").fill(recoveredPassword);
    await admittedBrowser.page.getByRole("button", { name: "Sign in" }).click();
    await waitForLocation(admittedBrowser.page, "/app");

    const reusedRecoveryBrowser = await freshPage(browser);
    await clickCapturedEmail(reusedRecoveryBrowser.page, recoveryMessage, "Reset password");
    await assertSafeCallbackFailure(
      reusedRecoveryBrowser.page,
      "callback_failed",
      recoveryCallback.tokenHash,
    );
    await reusedRecoveryBrowser.context.close();

    await expectProvisionedExactlyOnce(database, admittedEmail);
    await assertSensitiveValuesAbsentFromAudit(database, [
      admittedEmail,
      expiredCallback.tokenHash,
      invalidTokenHash,
      invitationCallback.tokenHash,
      recoveryCallback.tokenHash,
    ]);
    await admittedBrowser.context.close();
  } finally {
    await database.end();
  }
});
