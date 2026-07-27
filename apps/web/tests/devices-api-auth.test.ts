import { describe, expect, it, vi } from "vitest";

import {
  authenticateDeviceWithClient,
  type DeviceApiAdminClient,
} from "@/features/devices/api-auth";
import { generateDeviceCredential } from "@/features/devices/credentials";

const CREDENTIAL_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const PEPPER = Buffer.alloc(32, 0x63);

function clientWith(rpc: ReturnType<typeof vi.fn>): DeviceApiAdminClient {
  return {
    rpc,
    storage: {
      from: vi.fn(),
    },
  } as unknown as DeviceApiAdminClient;
}

describe("device API credential authentication", () => {
  it("looks up by non-secret prefix, verifies the full HMAC, then performs a throttled touch", async () => {
    const generated = generateDeviceCredential(PEPPER);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          credential_id: CREDENTIAL_ID,
          device_id: DEVICE_ID,
          prefix: generated.prefix,
          secret_digest: generated.digest,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { touched: true }, error: null });
    const request = new Request("https://talence.invalid/api/v1/device/me", {
      headers: { authorization: `Bearer ${generated.raw}` },
    });

    await expect(
      authenticateDeviceWithClient(request, clientWith(rpc), PEPPER, REQUEST_ID),
    ).resolves.toMatchObject({
      credentialId: CREDENTIAL_ID,
      deviceId: DEVICE_ID,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "device_credential_candidate", {
      p_prefix: generated.prefix,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "device_auth_touch", {
      p_device_id: DEVICE_ID,
      p_credential_id: CREDENTIAL_ID,
      p_request_id: REQUEST_ID,
    });
  });

  it("returns the same least-revealing error for an unknown prefix and wrong secret", async () => {
    const known = generateDeviceCredential(PEPPER);
    const unknown = generateDeviceCredential(PEPPER);
    const unknownRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const wrongRpc = vi.fn().mockResolvedValue({
      data: {
        credential_id: CREDENTIAL_ID,
        device_id: DEVICE_ID,
        prefix: known.prefix,
        secret_digest: known.digest,
      },
      error: null,
    });
    const wrongSecret = `${known.raw.slice(0, -1)}${known.raw.endsWith("A") ? "B" : "A"}`;

    for (const [raw, rpc] of [
      [unknown.raw, unknownRpc],
      [wrongSecret, wrongRpc],
    ] as const) {
      await expect(
        authenticateDeviceWithClient(
          new Request("https://talence.invalid/api/v1/device/me", {
            headers: { authorization: `Bearer ${raw}` },
          }),
          clientWith(rpc),
          PEPPER,
          REQUEST_ID,
        ),
      ).rejects.toMatchObject({
        status: 401,
        code: "device_credential_invalid",
        message: "The device credential is missing or invalid.",
      });
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("does not query a candidate for a missing or malformed bearer token", async () => {
    for (const authorization of [undefined, "Basic abc", "Bearer malformed"]) {
      const rpc = vi.fn();
      const headers = authorization ? { authorization } : undefined;
      await expect(
        authenticateDeviceWithClient(
          new Request("https://talence.invalid/api/v1/device/me", { headers }),
          clientWith(rpc),
          PEPPER,
          REQUEST_ID,
        ),
      ).rejects.toMatchObject({ status: 401, code: "device_credential_invalid" });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("fails a revoked or suspended post-HMAC touch without revealing lifecycle state", async () => {
    const generated = generateDeviceCredential(PEPPER);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          credential_id: CREDENTIAL_ID,
          device_id: DEVICE_ID,
          prefix: generated.prefix,
          secret_digest: generated.digest,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "P0001", message: "device_suspended" },
      });
    await expect(
      authenticateDeviceWithClient(
        new Request("https://talence.invalid/api/v1/device/me", {
          headers: { authorization: `Bearer ${generated.raw}` },
        }),
        clientWith(rpc),
        PEPPER,
        REQUEST_ID,
      ),
    ).rejects.toMatchObject({ status: 401, code: "device_credential_invalid" });
  });
});
