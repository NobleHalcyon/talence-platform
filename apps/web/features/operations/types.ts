export type OperationalControlKind = "application" | "device" | "external";

export interface OperationalControl {
  enabled: boolean;
  key: string;
  kind: OperationalControlKind;
  limits: Array<{ label: string; value: number | null }>;
  updatedAt: string;
}

export interface ExternalUsageSummary {
  requestCount: number;
  scopeKind: string;
  serviceKey: string;
  unitsConsumed: number;
}

export interface SafeAuditEvent {
  correlationId: string;
  eventType: string;
  id: string;
  occurredAt: string;
  resultCode: string;
}

export interface OperationalControls {
  application: OperationalControl[];
  device: OperationalControl[];
  external: OperationalControl[];
  recentAuditEvents: SafeAuditEvent[];
  usageToday: ExternalUsageSummary[];
}

export type OperationalControlsResult =
  { ok: true; data: OperationalControls } | { ok: false; requestId: string };
