import { ButtonLink, InlineAlert, Section } from "@talence/ui";

import { DeviceListView } from "@/components/devices/device-list";
import { DeviceRegistrationForm } from "@/components/devices/device-registration";
import {
  DevicePreviewBadge,
  DeviceReadErrorState,
  DeviceStatusNotice,
} from "@/components/devices/device-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadDeviceList } from "@/features/devices/data";
import { parseDeviceCursor, parseDeviceStatusFilter } from "@/features/devices/query";

export const metadata = {
  title: "Devices",
};

export default async function DevicesPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const status = parseDeviceStatusFilter(parameters);
  const page = await loadDeviceList(status, parseDeviceCursor(parameters));
  return (
    <PageFrame
      eyebrow="Registered machines"
      title="Devices"
      description="Register approved machines, issue one-time credentials, and keep every collection permission explicit."
      action={
        page.ok && page.data.permissions.canRegister ? (
          <ButtonLink href="#register-device">Register device</ButtonLink>
        ) : undefined
      }
    >
      <DeviceStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {page.ok ? (
        <>
          {page.preview ? <DevicePreviewBadge /> : null}
          {!page.data.permissions.canManage ? (
            <InlineAlert title="Read-only device view" tone="warning">
              Your workspace role may inspect registered devices, but only owners and administrators
              can issue credentials, change lifecycle state, or replace grants.
            </InlineAlert>
          ) : null}
          <DeviceListView page={page.data} status={status} />
          {page.data.nextCursor ? (
            <ButtonLink
              variant="secondary"
              href={`/app/devices?${new URLSearchParams({
                ...(status !== "all" ? { status_filter: status } : {}),
                cursor: page.data.nextCursor,
              })}`}
            >
              More devices
            </ButtonLink>
          ) : null}
          {page.data.permissions.canRegister ? (
            <Section
              id="register-device"
              title="Register a device"
              description="A 256-bit secret is generated on the trusted server. The raw credential is returned to this form exactly once."
            >
              <DeviceRegistrationForm workspaceId={page.data.workspaceId} />
            </Section>
          ) : null}
        </>
      ) : (
        <DeviceReadErrorState
          reason={page.reason}
          requestId={page.requestId}
          retryHref="/app/devices"
          subject="device list"
        />
      )}
    </PageFrame>
  );
}
