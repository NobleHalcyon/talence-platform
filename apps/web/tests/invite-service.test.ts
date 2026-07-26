import { describe, expect, it, vi } from "vitest";

import {
  issueAdmissionInvite,
  type InviteRepository,
  type ManagedAuthInviter,
} from "@/features/admin/invite-service";

const input = {
  actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "invited@example.com",
  expiresAt: "2026-08-02T23:59:59.999Z",
  note: "Private beta",
  redirectTo: "https://talence.example/auth/callback?type=invite&next=/invite/complete",
};

describe("trusted admission invitation sequencing", () => {
  it("commits admission before Auth and links server-controlled metadata", async () => {
    const events: string[] = [];
    const repository: InviteRepository = {
      prepare: vi.fn(async () => {
        events.push("prepare");
        return {
          email: "invited@example.com",
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }),
      markSent: vi.fn(async () => {
        events.push("mark-sent");
      }),
      markFailed: vi.fn(async () => {
        events.push("mark-failed");
      }),
    };
    const inviter: ManagedAuthInviter = {
      remove: vi.fn(),
      send: vi.fn(async ({ invitedUserId }) => {
        events.push(`auth:${invitedUserId}`);
        return { authUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
      }),
    };

    await expect(issueAdmissionInvite(input, repository, inviter)).resolves.toEqual({
      ok: true,
      invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(events).toEqual(["prepare", "auth:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "mark-sent"]);
    expect(inviter.send).toHaveBeenCalledWith({
      email: "invited@example.com",
      invitedUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      redirectTo: input.redirectTo,
    });
  });

  it("records only a stable safe code when managed Auth rejects", async () => {
    const repository: InviteRepository = {
      prepare: vi.fn(async () => ({
        email: "invited@example.com",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const inviter: ManagedAuthInviter = {
      remove: vi.fn(),
      send: vi.fn(async () => {
        throw new Error("raw provider detail must not escape");
      }),
    };

    await expect(issueAdmissionInvite(input, repository, inviter)).resolves.toEqual({
      ok: false,
      code: "auth_invite_failed",
      invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(repository.markFailed).toHaveBeenCalledWith({
      actorUserId: input.actorUserId,
      authUserId: null,
      errorCode: "auth_invite_failed",
      invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(repository.markSent).not.toHaveBeenCalled();
  });

  it("never calls managed Auth when admission preparation fails", async () => {
    const repository: InviteRepository = {
      prepare: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const inviter: ManagedAuthInviter = {
      remove: vi.fn(),
      send: vi.fn(),
    };

    await expect(issueAdmissionInvite(input, repository, inviter)).resolves.toEqual({
      ok: false,
      code: "invite_prepare_failed",
    });
    expect(inviter.send).not.toHaveBeenCalled();
  });

  it("removes the Auth identity when post-send ledger persistence fails", async () => {
    const repository: InviteRepository = {
      prepare: vi.fn(async () => ({
        email: "invited@example.com",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })),
      markSent: vi.fn(async () => {
        throw new Error("database rejected");
      }),
      markFailed: vi.fn(),
    };
    const inviter: ManagedAuthInviter = {
      remove: vi.fn(),
      send: vi.fn(async () => ({
        authUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      })),
    };

    await expect(issueAdmissionInvite(input, repository, inviter)).resolves.toEqual({
      ok: false,
      code: "invite_state_failed",
      invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(inviter.remove).toHaveBeenCalledWith("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(repository.markFailed).toHaveBeenCalledWith({
      actorUserId: input.actorUserId,
      authUserId: null,
      errorCode: "invite_state_failed",
      invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });
});
