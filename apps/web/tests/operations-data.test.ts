import { describe, expect, it } from "vitest";

import { parseOperationalControls } from "@/features/operations/data";

const UPDATED_AT = "2026-07-27T12:00:00.000Z";

describe("operational control response parsing", () => {
  it("accepts only the bounded safe fields rendered by the platform-admin surface", () => {
    expect(
      parseOperationalControls({
        application_features: [
          {
            enabled: true,
            feature_key: "catalog_search",
            max_units_per_request: 200,
            per_day_requests: 2_000,
            per_day_units: 50_000,
            per_minute_requests: 120,
            updated_at: UPDATED_AT,
          },
        ],
        device_features: [
          {
            enabled: true,
            feature_key: "inventory_write",
            max_items: 500,
            max_request_bytes: 262_144,
            per_day_requests: 10_000,
            per_day_units: 100_000,
            per_minute_requests: 120,
            updated_at: UPDATED_AT,
          },
        ],
        external_services: [
          {
            enabled: true,
            global_daily_units: 100,
            per_device_daily_units: null,
            per_user_daily_units: 20,
            per_workspace_daily_units: 50,
            service_key: "managed_auth_invitation",
            updated_at: UPDATED_AT,
          },
        ],
        external_usage_today: [
          {
            request_count: 2,
            scope_kind: "workspace",
            service_key: "managed_auth_invitation",
            units_consumed: 2,
          },
        ],
        recent_audit_events: [
          {
            correlation_id: "60000000-0000-4000-8000-000000000001",
            event_type: "operational_control.updated",
            id: "60000000-0000-4000-8000-000000000002",
            occurred_at: UPDATED_AT,
            result_code: "disabled",
          },
        ],
      }),
    ).toEqual({
      application: [
        {
          enabled: true,
          key: "catalog_search",
          kind: "application",
          limits: [
            { label: "Requests / minute", value: 120 },
            { label: "Requests / day", value: 2_000 },
            { label: "Units / day", value: 50_000 },
            { label: "Units / request", value: 200 },
          ],
          updatedAt: UPDATED_AT,
        },
      ],
      device: [
        {
          enabled: true,
          key: "inventory_write",
          kind: "device",
          limits: [
            { label: "Requests / minute", value: 120 },
            { label: "Requests / day", value: 10_000 },
            { label: "Units / day", value: 100_000 },
            { label: "Maximum bytes", value: 262_144 },
            { label: "Maximum items", value: 500 },
          ],
          updatedAt: UPDATED_AT,
        },
      ],
      external: [
        {
          enabled: true,
          key: "managed_auth_invitation",
          kind: "external",
          limits: [
            { label: "Global units / day", value: 100 },
            { label: "User units / day", value: 20 },
            { label: "Workspace units / day", value: 50 },
            { label: "Device units / day", value: null },
          ],
          updatedAt: UPDATED_AT,
        },
      ],
      recentAuditEvents: [
        {
          correlationId: "60000000-0000-4000-8000-000000000001",
          eventType: "operational_control.updated",
          id: "60000000-0000-4000-8000-000000000002",
          occurredAt: UPDATED_AT,
          resultCode: "disabled",
        },
      ],
      usageToday: [
        {
          requestCount: 2,
          scopeKind: "workspace",
          serviceKey: "managed_auth_invitation",
          unitsConsumed: 2,
        },
      ],
    });
  });

  it("fails closed on malformed or unexpectedly negative quota data", () => {
    expect(
      parseOperationalControls({
        application_features: [],
        device_features: [],
        external_services: [],
        external_usage_today: [
          {
            request_count: -1,
            scope_kind: "workspace",
            service_key: "managed_auth_invitation",
            units_consumed: 1,
          },
        ],
        recent_audit_events: [],
      }),
    ).toBeNull();
  });
});
