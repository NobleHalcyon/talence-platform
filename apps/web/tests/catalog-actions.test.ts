import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  persistCatalogViewAction,
  queueCatalogSyncAction,
  queueCatalogSyncWithClient,
} from "@/features/catalog/actions";
import type { CatalogRpcClient } from "@/features/catalog/types";

const mocks = vi.hoisted(() => ({
  catalogSyncEnabled: vi.fn(() => true),
  createAdminSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getAppContextState: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/catalog/config", () => ({
  catalogSyncEnabled: mocks.catalogSyncEnabled,
}));
vi.mock("@/lib/auth/app-context", () => ({
  getAppContextState: mocks.getAppContextState,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";

function context(isPlatformAdmin: boolean) {
  return {
    status: "ready",
    context: {
      userId: USER_ID,
      isPlatformAdmin,
      collections: [],
      workspaces: [],
      workspace: {
        id: "workspace",
        name: "Personal",
        role: "owner",
        slug: "personal",
        type: "personal",
      },
      profile: {
        user_id: USER_ID,
        avatar_path: null,
        default_collection_id: null,
        default_workspace_id: null,
        display_name: "Collector",
        handle: "collector",
        preferred_currency: "USD",
        status: "active",
      },
    },
  };
}

describe("catalog server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("queues work through one RPC and never imports in the request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        import_run_id: "22222222-2222-4222-8222-222222222222",
        status: "queued",
      },
      error: null,
    });

    await expect(
      queueCatalogSyncWithClient({ rpc } as CatalogRpcClient, USER_ID, true),
    ).resolves.toEqual({
      ok: true,
      importRunId: "22222222-2222-4222-8222-222222222222",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_queue_catalog_sync", {
      p_actor_user_id: USER_ID,
      p_force: true,
      p_trigger_type: "manual",
    });
  });

  it("denies the admin queue action before creating a trusted client", async () => {
    mocks.getAppContextState.mockResolvedValue(context(false));
    const form = new FormData();

    await expect(queueCatalogSyncAction(form)).rejects.toThrow("NEXT_REDIRECT:");
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("persists a validated table or grid preference for the admitted user", async () => {
    mocks.getAppContextState.mockResolvedValue(context(false));
    const maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({ update })),
    });
    const form = new FormData();
    form.set("view", "grid");
    form.set("returnTo", "/app/catalog?q=lotus&view=grid");

    await expect(persistCatalogViewAction(form)).rejects.toThrow("NEXT_REDIRECT:");
    expect(update).toHaveBeenCalledWith({ catalog_view: "grid" });
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(select).toHaveBeenCalledWith("user_id");
    expect(mocks.redirect).toHaveBeenLastCalledWith("/app/catalog?q=lotus&view=grid");
  });
});
