import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  createAdmin: vi.fn(),
  createServer: vi.fn(),
  getAppContextState: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));
vi.mock("@/lib/auth/app-context", () => ({
  getAppContextState: mocks.getAppContextState,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServer,
}));

import { registerDeviceAction, rotateDeviceCredentialAction } from "@/features/devices/actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const CREDENTIAL_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-27T12:00:00.000Z";

function baseDevice(args: Record<string, unknown>) {
  return {
    device_id: DEVICE_ID,
    workspace_id: WORKSPACE_ID,
    name: args.p_name ?? "Registered sorter",
    type: args.p_type ?? "talence_sorter",
    manufacturer: args.p_manufacturer ?? null,
    model: args.p_model ?? null,
    serial_number: args.p_serial_number ?? null,
    status: "active",
    last_seen_at: null,
    last_catalog_snapshot_id: null,
    last_catalog_snapshot_version: null,
    last_client_version: null,
    last_firmware_version: null,
    suspended_at: null,
    revoked_at: null,
    deleted_at: null,
    created_by_user_id: USER_ID,
    created_at: NOW,
    updated_at: NOW,
  };
}

function credential(prefix: unknown) {
  return {
    credential_id: CREDENTIAL_ID,
    prefix,
    created_at: NOW,
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    is_active: true,
  };
}

beforeEach(() => {
  mocks.adminRpc.mockReset();
  mocks.createAdmin.mockReset();
  mocks.createServer.mockReset();
  mocks.getAppContextState.mockReset();
  mocks.revalidatePath.mockReset();
  process.env.DEVICE_CREDENTIAL_PEPPER = "x".repeat(32);
  mocks.getAppContextState.mockResolvedValue({
    status: "ready",
    context: {
      userId: USER_ID,
      workspace: { id: WORKSPACE_ID, role: "owner" },
    },
  });
  mocks.createServer.mockResolvedValue({ rpc: vi.fn() });
  mocks.createAdmin.mockReturnValue({ rpc: mocks.adminRpc });
});

afterEach(() => {
  delete process.env.DEVICE_CREDENTIAL_PEPPER;
  delete process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW;
});

describe("trusted device credential server actions", () => {
  it("registers through a service-only RPC with actor, prefix, and digest—but never raw secret", async () => {
    mocks.adminRpc.mockImplementation(
      async (functionName: string, args: Record<string, unknown>) => ({
        data:
          functionName === "device_register"
            ? {
                device: baseDevice(args),
                credential: credential(args.p_credential_prefix),
              }
            : null,
        error: null,
      }),
    );
    const form = new FormData();
    form.set("workspaceId", WORKSPACE_ID);
    form.set("name", "Registered sorter");
    form.set("type", "talence_sorter");
    form.set("manufacturer", "Talence");
    form.set("model", "Beta");
    form.set("serialNumber", "SERIAL-1");

    const state = await registerDeviceAction({ status: "idle" }, form);
    expect(state).toMatchObject({
      status: "issued",
      deviceId: DEVICE_ID,
      deviceName: "Registered sorter",
      prefix: expect.stringMatching(/^[a-f0-9]{12}$/),
      credential: expect.stringMatching(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/),
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "device_register",
      expect.objectContaining({
        p_actor_user_id: USER_ID,
        p_workspace_id: WORKSPACE_ID,
        p_credential_prefix: expect.stringMatching(/^[a-f0-9]{12}$/),
        p_credential_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    const rpcArgs = mocks.adminRpc.mock.calls[0]?.[1];
    expect(JSON.stringify(rpcArgs)).not.toContain(
      state.status === "issued" ? state.credential : "unreachable",
    );
    expect(rpcArgs).not.toHaveProperty("p_credential");
  });

  it("rotates through the service-only actor boundary and returns the new raw value once", async () => {
    mocks.adminRpc.mockImplementation(
      async (_functionName: string, args: Record<string, unknown>) => ({
        data: {
          device_id: DEVICE_ID,
          credential: credential(args.p_credential_prefix),
          revoked_credential_ids: [],
        },
        error: null,
      }),
    );
    const form = new FormData();
    form.set("deviceId", DEVICE_ID);
    const state = await rotateDeviceCredentialAction({ status: "idle" }, form);

    expect(state.status).toBe("issued");
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "device_rotate_credential",
      expect.objectContaining({
        p_actor_user_id: USER_ID,
        p_device_id: DEVICE_ID,
        p_credential_prefix: expect.stringMatching(/^[a-f0-9]{12}$/),
        p_credential_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("fails closed before service-role use for a viewer", async () => {
    mocks.getAppContextState.mockResolvedValue({
      status: "ready",
      context: {
        userId: USER_ID,
        workspace: { id: WORKSPACE_ID, role: "viewer" },
      },
    });
    const form = new FormData();
    form.set("workspaceId", WORKSPACE_ID);
    form.set("name", "Denied");
    form.set("type", "scanner");

    await expect(registerDeviceAction({ status: "idle" }, form)).resolves.toMatchObject({
      status: "error",
      code: "permission_denied",
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("supports deterministic non-production preview without requiring a real pepper", async () => {
    delete process.env.DEVICE_CREDENTIAL_PEPPER;
    process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW = "true";
    mocks.getAppContextState.mockResolvedValue({ status: "unconfigured" });
    const form = new FormData();
    form.set("workspaceId", WORKSPACE_ID);
    form.set("name", "Preview scanner");
    form.set("type", "scanner");

    await expect(registerDeviceAction({ status: "idle" }, form)).resolves.toMatchObject({
      status: "issued",
      deviceName: "Preview scanner",
      credential: expect.stringMatching(/^tlc_dev_/),
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
});
