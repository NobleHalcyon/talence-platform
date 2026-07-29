import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppContextState } from "@/lib/auth/app-context";
import { getVerifiedAuthState } from "@/lib/auth/auth-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/auth-state", () => ({
  getVerifiedAuthState: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const collectionId = "33333333-3333-4333-8333-333333333333";

const databaseContext = {
  is_platform_admin: false,
  profile: {
    avatar_path: null,
    default_collection_id: collectionId,
    default_workspace_id: workspaceId,
    display_name: "Admitted Collector",
    handle: "admitted_collector",
    preferred_currency: "USD",
    status: "active",
    user_id: userId,
  },
  user_id: userId,
  workspace: {
    id: workspaceId,
    name: "Personal workspace",
    role: "owner",
    slug: "personal-workspace",
    status: "active",
    type: "personal",
  },
};

function queryBuilder(result: unknown, rejection?: Error) {
  const query: Record<string, unknown> = {};
  for (const method of ["eq", "in", "order", "select"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) =>
    (rejection ? Promise.reject(rejection) : Promise.resolve(result)).then(onFulfilled, onRejected);
  return query;
}

function readyClient(overrides?: {
  collections?: object;
  memberships?: object;
  rpc?: ReturnType<typeof vi.fn>;
  workspaces?: object;
}) {
  const membershipQuery =
    overrides?.memberships ??
    queryBuilder({
      data: [{ role: "owner", status: "active", workspace_id: workspaceId }],
      error: null,
    });
  const workspaceQuery =
    overrides?.workspaces ??
    queryBuilder({
      data: [
        {
          id: workspaceId,
          name: "Personal workspace",
          slug: "personal-workspace",
          status: "active",
          type: "personal",
        },
      ],
      error: null,
    });
  const collectionQuery =
    overrides?.collections ??
    queryBuilder({
      data: [{ id: collectionId, name: "Main Collection", slug: "main-collection" }],
      error: null,
    });

  return {
    from: vi.fn((table: string) => {
      if (table === "workspace_memberships") {
        return membershipQuery;
      }
      if (table === "workspaces") {
        return workspaceQuery;
      }
      if (table === "collections") {
        return collectionQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc:
      overrides?.rpc ??
      vi.fn().mockResolvedValue({
        data: databaseContext,
        error: null,
      }),
  };
}

describe("application context failure boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVerifiedAuthState).mockResolvedValue({
      status: "authenticated",
      claims: {
        aal: "aal1",
        aud: "authenticated",
        exp: 1_800_000_000,
        iat: 1_700_000_000,
        iss: "https://talence.example/auth/v1",
        role: "authenticated",
        session_id: "44444444-4444-4444-8444-444444444444",
        sub: userId,
      },
    });
  });

  it("treats a rejected verified-auth lookup as unauthenticated", async () => {
    vi.mocked(getVerifiedAuthState).mockRejectedValue(new Error("raw cookie failure"));

    await expect(getAppContextState()).resolves.toEqual({ status: "unauthenticated" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("denies admission when authenticated client initialization rejects", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("raw cookie failure"));

    await expect(getAppContextState()).resolves.toEqual({
      status: "denied",
      reason: "admission",
    });
  });

  it("denies admission when the canonical context RPC rejects", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      readyClient({
        rpc: vi.fn().mockRejectedValue(new Error("raw network failure")),
      }) as never,
    );

    await expect(getAppContextState()).resolves.toEqual({
      status: "denied",
      reason: "admission",
    });
  });

  it("denies workspace access when membership loading rejects", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      readyClient({
        memberships: queryBuilder(null, new Error("raw database failure")),
      }) as never,
    );

    await expect(getAppContextState()).resolves.toEqual({
      status: "denied",
      reason: "workspace",
    });
  });

  it("denies workspace access when collection loading returns an error", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      readyClient({
        collections: queryBuilder({ data: null, error: { code: "provider_error" } }),
      }) as never,
    );

    await expect(getAppContextState()).resolves.toEqual({
      status: "denied",
      reason: "workspace",
    });
  });

  it("still returns the bounded ready context when every scoped read succeeds", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(readyClient() as never);

    const result = await getAppContextState();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.context.userId).toBe(userId);
      expect(result.context.workspaces).toHaveLength(1);
      expect(result.context.collections).toEqual([
        { id: collectionId, name: "Main Collection", slug: "main-collection" },
      ]);
    }
  });
});
