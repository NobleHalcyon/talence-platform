import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AuthAdminGateway } from "./contracts.js";
import { AdminOperationError, safeAuthErrorCode } from "./errors.js";
import type { AuthUserIdentity, InviteAuthUserInput } from "./types.js";
import { normalizeEmail } from "./validation.js";

const usersPerPage = 100;
const maximumUserPages = 100;

export function createSupabaseAuthAdminGateway(
  supabaseUrl: string,
  secretKey: string,
): SupabaseAuthAdminGateway {
  const client = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "talence-admin-cli/0.1",
      },
    },
  });
  return new SupabaseAuthAdminGateway(client);
}

export class SupabaseAuthAdminGateway implements AuthAdminGateway {
  readonly #client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.#client = client;
  }

  async inviteUser(input: InviteAuthUserInput): Promise<AuthUserIdentity> {
    const { data, error } = await this.#client.auth.admin.inviteUserByEmail(input.email, {
      data: {
        invited_user_id: input.invitedUserId,
      },
      redirectTo: input.redirectTo,
    });

    if (error) {
      throw error;
    }
    if (!data.user) {
      throw new AdminOperationError(
        "auth_contract_invalid",
        "Supabase Auth returned no user for the invitation.",
        "external",
      );
    }
    return { id: data.user.id, email: data.user.email ?? null };
  }

  async findUserByEmail(email: string): Promise<AuthUserIdentity | null> {
    const normalizedEmail = normalizeEmail(email);
    const matches: AuthUserIdentity[] = [];

    for (let page = 1; page <= maximumUserPages; page += 1) {
      const { data, error } = await this.#client.auth.admin.listUsers({
        page,
        perPage: usersPerPage,
      });
      if (error) {
        throw error;
      }

      for (const user of data.users) {
        if (user.email !== undefined && normalizeEmail(user.email) === normalizedEmail) {
          matches.push({ id: user.id, email: user.email });
        }
      }

      if (data.users.length < usersPerPage) {
        break;
      }
      if (page === maximumUserPages) {
        throw new AdminOperationError(
          "auth_lookup_limit_exceeded",
          "The Auth user lookup exceeded its bounded pagination limit. Use an exact user ID.",
          "external",
        );
      }
    }

    if (matches.length > 1) {
      throw new AdminOperationError(
        "auth_email_not_unique",
        "Multiple Auth identities matched the normalized email. Resolve them before bootstrapping.",
        "conflict",
      );
    }
    return matches[0] ?? null;
  }

  async getUserById(userId: string): Promise<AuthUserIdentity | null> {
    const { data, error } = await this.#client.auth.admin.getUserById(userId);
    if (error) {
      if (safeAuthErrorCode("lookup", error) === "auth_user_not_found") {
        return null;
      }
      throw error;
    }
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }

  async deleteUser(userId: string): Promise<"deleted" | "not_found"> {
    const { error } = await this.#client.auth.admin.deleteUser(userId, false);
    if (error) {
      if (safeAuthErrorCode("delete", error) === "auth_user_not_found") {
        return "not_found";
      }
      throw error;
    }
    return "deleted";
  }
}
