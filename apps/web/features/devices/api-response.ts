import { randomUUID } from "node:crypto";

import type { ErrorResponse } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DeviceApiRequestContext {
  requestId: string;
}

export class DeviceApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly headers: HeadersInit | undefined;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    headers?: HeadersInit,
  ) {
    super(message);
    this.name = "DeviceApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export function deviceApiRequestContext(request: Request): DeviceApiRequestContext {
  const supplied = request.headers.get("x-request-id")?.trim();
  return {
    requestId: supplied && UUID_PATTERN.test(supplied) ? supplied.toLowerCase() : randomUUID(),
  };
}

function responseHeaders(requestId: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-request-id", requestId);
  return headers;
}

export function deviceApiSuccess<T>(
  context: DeviceApiRequestContext,
  data: T,
  status = 200,
  metadata: Record<string, unknown> = {},
  headers?: HeadersInit,
): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        ...metadata,
        request_id: context.requestId,
      },
    }),
    {
      status,
      headers: responseHeaders(context.requestId, headers),
    },
  );
}

export function deviceApiFailure(
  context: DeviceApiRequestContext,
  error: DeviceApiError,
): Response {
  const body: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    meta: {
      request_id: context.requestId,
    },
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: responseHeaders(context.requestId, error.headers),
  });
}

export function unexpectedDeviceApiFailure(context: DeviceApiRequestContext): Response {
  return deviceApiFailure(
    context,
    new DeviceApiError(
      500,
      "internal_error",
      "The request could not be completed. Nothing changed.",
    ),
  );
}
