import {
  DeviceApiError,
  deviceApiFailure,
  deviceApiRequestContext,
  type DeviceApiRequestContext,
  unexpectedDeviceApiFailure,
} from "./api-response";
import { writeSecurityLog } from "@/lib/observability/security-log";

export async function handleDeviceApiRequest(
  request: Request,
  operation: (context: DeviceApiRequestContext) => Promise<Response>,
): Promise<Response> {
  const context = deviceApiRequestContext(request);
  const startedAt = performance.now();
  try {
    const response = await operation(context);
    writeSecurityLog("info", "device.request.completed", {
      device_id: context.deviceId,
      duration_ms: Math.round(performance.now() - startedAt),
      request_id: context.requestId,
      result_code: response.status < 400 ? "succeeded" : "failed",
      route: new URL(request.url).pathname,
      status: response.status,
    });
    return response;
  } catch (error) {
    const response =
      error instanceof DeviceApiError
        ? deviceApiFailure(context, error)
        : unexpectedDeviceApiFailure(context);
    writeSecurityLog(error instanceof DeviceApiError ? "warn" : "error", "device.request.failed", {
      code: error instanceof DeviceApiError ? error.code : "internal_error",
      device_id: context.deviceId,
      duration_ms: Math.round(performance.now() - startedAt),
      quota_category:
        error instanceof DeviceApiError && error.status === 429 ? "device_quota" : undefined,
      request_id: context.requestId,
      result_code: "failed",
      route: new URL(request.url).pathname,
      status: response.status,
    });
    return response;
  }
}
