import {
  DeviceApiError,
  deviceApiFailure,
  deviceApiRequestContext,
  type DeviceApiRequestContext,
  unexpectedDeviceApiFailure,
} from "./api-response";

export async function handleDeviceApiRequest(
  request: Request,
  operation: (context: DeviceApiRequestContext) => Promise<Response>,
): Promise<Response> {
  const context = deviceApiRequestContext(request);
  try {
    return await operation(context);
  } catch (error) {
    return error instanceof DeviceApiError
      ? deviceApiFailure(context, error)
      : unexpectedDeviceApiFailure(context);
  }
}
