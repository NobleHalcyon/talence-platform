import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Device",
};

export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Device identity"
      title="Device details"
      description="Health, last-seen time, installed snapshot, credential lifecycle, and explicit collection grants."
      foundation="This cloud view will never expose remote motion controls or treat run-summary state as a robot execution checkpoint."
      resourceId={deviceId}
    />
  );
}
