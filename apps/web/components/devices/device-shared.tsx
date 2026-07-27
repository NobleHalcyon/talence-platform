import { Badge, ButtonLink, ErrorState, InlineAlert } from "@talence/ui";

import type { DeviceLoadFailureReason, DeviceStatus, DeviceType } from "@/features/devices/types";

export function deviceStatusTone(status: DeviceStatus): "danger" | "success" | "warning" {
  return status === "active" ? "success" : status === "suspended" ? "warning" : "danger";
}

export function deviceTypeLabel(type: DeviceType): string {
  return {
    talence_sorter: "Talence sorter",
    scanner: "Scanner",
    kiosk: "Kiosk",
    third_party: "Third party",
  }[type];
}

export function formatDeviceInstant(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return <Badge tone={deviceStatusTone(status)}>{status}</Badge>;
}

export function DevicePreviewBadge() {
  return <Badge tone="information">Deterministic preview data</Badge>;
}

export function DeviceStatusNotice({
  status,
  requestId,
}: {
  status: string | string[] | undefined;
  requestId: string | string[] | undefined;
}) {
  const value = Array.isArray(status) ? status[0] : status;
  const reference = Array.isArray(requestId) ? requestId[0] : requestId;
  const messages: Record<string, { title: string; message: string; tone?: "danger" | "success" }> =
    {
      device_updated: {
        title: "Device updated",
        message: "The saved device fields are current.",
        tone: "success",
      },
      device_suspended: {
        title: "Device suspended",
        message: "Its credentials remain stored, but API requests are denied until activation.",
        tone: "success",
      },
      device_activated: {
        title: "Device activated",
        message: "Active, non-revoked credentials may authenticate again.",
        tone: "success",
      },
      device_revoked: {
        title: "Device revoked",
        message: "The device and every credential are now terminally revoked.",
        tone: "success",
      },
      device_deleted: {
        title: "Device deleted",
        message: "The revoked device left ordinary views; retained audit records were not altered.",
        tone: "success",
      },
      grants_updated: {
        title: "Collection grants updated",
        message: "Only the checked collection permissions remain.",
        tone: "success",
      },
      credential_revoked: {
        title: "Credential revoked",
        message: "That credential can no longer authenticate.",
        tone: "success",
      },
      stale_device: {
        title: "Device changed elsewhere",
        message: "Nothing changed. Reload and retry from the current device state.",
        tone: "danger",
      },
      permission_denied: {
        title: "Permission denied",
        message: "Only an active workspace owner or administrator may manage devices.",
        tone: "danger",
      },
      mutation_failed: {
        title: "Device action failed",
        message: "Nothing changed. Reload and retry.",
        tone: "danger",
      },
    };
  const notice = value ? messages[value] : undefined;
  if (!notice) return null;
  return (
    <InlineAlert title={notice.title} tone={notice.tone ?? "information"}>
      {notice.message}
      {reference ? ` Support reference: ${reference}.` : ""}
    </InlineAlert>
  );
}

export function DeviceReadErrorState({
  reason,
  requestId,
  retryHref,
  subject,
}: {
  reason: DeviceLoadFailureReason;
  requestId: string;
  retryHref: string;
  subject: string;
}) {
  const content = {
    configuration_required: {
      title: "Device data is not configured",
      message: "Configure the trusted Supabase server environment, then reload.",
    },
    invalid_response: {
      title: `The ${subject} response was invalid`,
      message: "Nothing changed. The server rejected an inconsistent database response.",
    },
    not_found: {
      title: `The ${subject} was not found`,
      message: "It may be deleted, outside this workspace, or unavailable to your role.",
    },
    permission_denied: {
      title: `You cannot access this ${subject}`,
      message: "The current workspace role does not permit this device view.",
    },
    request_failed: {
      title: `The ${subject} could not be loaded`,
      message: "Nothing changed. Retry the authenticated request safely.",
    },
  }[reason];
  return (
    <ErrorState
      title={content.title}
      message={`${content.message} Support reference: ${requestId}.`}
      action={
        <ButtonLink href={retryHref} variant="secondary">
          Retry
        </ButtonLink>
      }
    />
  );
}
