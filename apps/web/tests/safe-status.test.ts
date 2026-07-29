import { describe, expect, it } from "vitest";

import { getSafeStatus, safeRequestId, statusHref } from "@/lib/auth/safe-status";

describe("safe action status", () => {
  it("does not reflect unknown provider or database errors", () => {
    expect(getSafeStatus("raw postgres failure")).toBeNull();
    expect(getSafeStatus("sign_in_failed")).toEqual({
      title: "Sign-in failed",
      message: "The credentials could not be verified for an admitted account.",
      tone: "danger",
    });
  });

  it("accepts only bounded correlation identifiers", () => {
    const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(safeRequestId(requestId)).toBe(requestId);
    expect(safeRequestId("<script>alert(1)</script>")).toBeNull();
    expect(statusHref("/login", "sign_in_failed", requestId)).toBe(
      `/login?status=sign_in_failed&request_id=${requestId}`,
    );
  });
});
