import { DEVICE_STATUSES, type DeviceStatus } from "./types";

const STATUSES = new Set<string>(DEVICE_STATUSES);

export function parseDeviceStatusFilter(
  parameters: Record<string, string | string[] | undefined>,
): DeviceStatus | "all" {
  const raw = parameters.status_filter;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && STATUSES.has(value) ? (value as DeviceStatus) : "all";
}

export function parseDeviceCursor(
  parameters: Record<string, string | string[] | undefined>,
): string | null {
  const raw = parameters.cursor;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length <= 1_024 && !/[\u0000-\u001f]/.test(value) ? value : null;
}
