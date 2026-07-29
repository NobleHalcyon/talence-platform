import { beforeEach, describe, expect, it, vi } from "vitest";

import { setActiveWorkspaceAction, updateSettingsAction } from "@/features/settings/actions";
import { getAppContextState } from "@/lib/auth/app-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/app-context", () => ({
  getAppContextState: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const collectionId = "33333333-3333-4333-8333-333333333333";

function redirectError(href: string): Error {
  return new Error(`NEXT_REDIRECT:${href}`);
}

function expectRedirect(pathname: string, status: string): void {
  expect(mocks.redirect).toHaveBeenLastCalledWith(
    expect.stringMatching(
      new RegExp(
        `^${pathname.replaceAll("/", "\\/")}\\?status=${status}&request_id=[0-9a-f-]{36}$`,
      ),
    ),
  );
}

function queryBuilder(result: unknown, rejection?: Error) {
  const query: Record<string, unknown> = {};
  for (const method of ["eq", "order", "select"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) =>
    (rejection ? Promise.reject(rejection) : Promise.resolve(result)).then(onFulfilled, onRejected);
  return query;
}

function settingsClient(options?: {
  collectionRejection?: Error;
  preferenceRejection?: Error;
  profileRejection?: Error;
}) {
  const collectionQuery = queryBuilder(
    { data: [{ id: collectionId }], error: null },
    options?.collectionRejection,
  );
  const profileQuery = queryBuilder({ data: null, error: null }, options?.profileRejection);
  const preferenceUpsert = options?.preferenceRejection
    ? vi.fn().mockRejectedValue(options.preferenceRejection)
    : vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "collections") {
        return collectionQuery;
      }
      if (table === "profiles") {
        return { update: vi.fn(() => profileQuery) };
      }
      if (table === "user_preferences") {
        return { upsert: preferenceUpsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    preferenceUpsert,
  };
}

function validSettingsForm(): FormData {
  const formData = new FormData();
  formData.set("displayName", "Updated Collector");
  formData.set("handle", "updated_collector");
  formData.set("defaultWorkspaceId", workspaceId);
  formData.set("defaultCollectionId", collectionId);
  formData.set("avatarPath", "");
  formData.set("preferredCurrency", "USD");
  formData.set("collectionView", "structured");
  formData.set("deckView", "list");
  return formData;
}

function workspaceForm(): FormData {
  const formData = new FormData();
  formData.set("workspaceId", workspaceId);
  return formData;
}

describe("settings server action failure boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((href: string) => {
      throw redirectError(href);
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getAppContextState).mockResolvedValue({
      status: "ready",
      context: {
        collections: [{ id: collectionId, name: "Main Collection", slug: "main-collection" }],
        isPlatformAdmin: false,
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
        userId,
        workspace: {
          id: workspaceId,
          name: "Personal workspace",
          role: "owner",
          slug: "personal-workspace",
          type: "personal",
        },
        workspaces: [
          {
            id: workspaceId,
            name: "Personal workspace",
            role: "owner",
            slug: "personal-workspace",
            type: "personal",
          },
        ],
      },
    });
  });

  it("normalizes a rejected context lookup without exposing the exception", async () => {
    vi.mocked(getAppContextState).mockRejectedValue(new Error("raw cookie failure"));

    await expect(updateSettingsAction(validSettingsForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/login", "account_unavailable");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("raw cookie failure");
  });

  it("normalizes a rejected server-client initialization during workspace switching", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("raw cookie failure"));

    await expect(setActiveWorkspaceAction(workspaceForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/app/settings", "settings_failed");
  });

  it("normalizes a rejected collection authorization read", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      settingsClient({ collectionRejection: new Error("raw network failure") }) as never,
    );

    await expect(updateSettingsAction(validSettingsForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/app/settings", "settings_failed");
  });

  it("normalizes a rejected profile update", async () => {
    const client = settingsClient({ profileRejection: new Error("raw database failure") });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    await expect(updateSettingsAction(validSettingsForm())).rejects.toThrow("NEXT_REDIRECT:");

    expectRedirect("/app/settings", "settings_failed");
    expect(client.preferenceUpsert).not.toHaveBeenCalled();
  });

  it("normalizes a rejected preference update after the scoped profile update", async () => {
    const client = settingsClient({ preferenceRejection: new Error("raw database failure") });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    await expect(updateSettingsAction(validSettingsForm())).rejects.toThrow("NEXT_REDIRECT:");

    expect(client.preferenceUpsert).toHaveBeenCalledWith(
      {
        collection_view: "structured",
        deck_view: "list",
        user_id: userId,
      },
      { onConflict: "user_id" },
    );
    expectRedirect("/app/settings", "settings_failed");
  });
});
