import { ButtonLink } from "@talence/ui";

import { DeviceDetailView } from "@/components/devices/device-detail";
import {
  DevicePreviewBadge,
  DeviceReadErrorState,
  DeviceStatusNotice,
} from "@/components/devices/device-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadDeviceDetail } from "@/features/devices/data";

export const metadata = {
  title: "Device",
};

export default async function DevicePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ deviceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ deviceId }, parameters] = await Promise.all([params, searchParams]);
  const detail = await loadDeviceDetail(deviceId);
  return (
    <PageFrame
      eyebrow="Device administration"
      title={detail.ok ? detail.data.device.name : "Device details"}
      description="Credential lifecycle, connection evidence, and explicit collection grants—without remote motion or cloud execution checkpoints."
      action={
        <ButtonLink href="/app/devices" variant="secondary">
          All devices
        </ButtonLink>
      }
    >
      <DeviceStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {detail.ok ? (
        <>
          {detail.preview ? <DevicePreviewBadge /> : null}
          <DeviceDetailView detail={detail.data} />
        </>
      ) : (
        <DeviceReadErrorState
          reason={detail.reason}
          requestId={detail.requestId}
          retryHref={`/app/devices/${encodeURIComponent(deviceId)}`}
          subject="device"
        />
      )}
    </PageFrame>
  );
}
